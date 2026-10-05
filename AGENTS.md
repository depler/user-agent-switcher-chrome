# AGENTS.md — User-Agent Switcher (Chrome port)

This file is the project map for agents and developers. It explains where the
project came from, how it differs from the original, how it is structured, and
how to run, develop and test it, plus the places that are easy to break.

> Code, comments and JSDoc are in English. Code style is inherited from the
> original: **tabs**, **double quotes**, semicolons, JSDoc types (no `tsc` emit).

> **Never `git commit` or `git push` automatically.** Create commits or push
> only when the user explicitly asks for it. Staging/editing files as part of a
> requested change is fine, but do not turn it into a commit (or a push) on your
> own initiative — even if a commit would be the natural next step.

---

## 1. What this is

A port of **[ntninja / User-Agent Switcher](https://gitlab.com/ntninja/user-agent-switcher)**
(originally a Firefox WebExtension, Manifest V2) to **Chrome Manifest V3**.

Features:

- overrides the HTTP `User-Agent` request header globally or per site;
- overrides JS `navigator.*` properties (userAgent, platform, appVersion, vendor, …);
- a list of preset User-Agents (desktop / mobile / bot / other) plus custom ones;
- random UA rotation on a timer or on browser startup;
- a popup for picking a UA, per-site override and random-mode configuration;
- a separate options page for the UA list (table / text mode);
- 38 languages (`_locales/`).

- **Version:** `1.4.0` (the version scheme follows the original's `1.4.x`)
- **License:** GPL-3.0-or-later (see `LICENSE.md`); `deps/*` keep their own licenses
- **Status:** working port, covered by a CDP smoke test.

---

## 2. Origin and differences

The original was cloned to `D:\Sources\Empty\user-agent-switcher` (Firefox, MV2).
The port is `D:\Sources\user-agent-switcher-chrome` (this repository).

Shared code (`utils/*`, matching engine, BrowsCap parser, presets, i18n, popup
scripts) was carried over almost verbatim. Only what cannot work in Chrome was
replaced.

| Firefox original | Chrome port | Where |
|---|---|---|
| `manifest_version: 2` | `manifest_version: 3` (service worker, `action`) | `manifest.json` |
| Blocking `browser.webRequest.onBeforeSendHeaders` | `chrome.declarativeNetRequest` (`modifyHeaders`) | `background/dnr.js` |
| `browser.contentScripts.register()` with inline code | `chrome.scripting.registerContentScripts()` + a file in `world: "MAIN"` | `background/worker.js`, `content/` |
| Firefox Xray (`wrappedJSObject`/`cloneInto`/`exportFunction`) | Plain getters on `Navigator.prototype` | `content/navigator-override.js` |
| `browser.browserAction.*` | `chrome.action.*`; PNG icons (Chrome does not support SVG) | `background/worker.js`, `assets/icons/` |
| `window.setTimeout` for random mode | `chrome.alarms` (survives service-worker termination) | `background/worker.js` |
| `browser.theme` / `getBrowserInfo` | removed | `ui/popup/index.js` |
| `browser_style: true` | own `ui/common/browser-style.css` | `ui/common/` |
| Firefox-only `console.exception` | shim in `utils/polyfill.js` | `utils/polyfill.js` |
| locales with an undeclared `$HOSTNAME$` | added `placeholders` (Chrome validates strictly) | `_locales/*/messages.json` |
| `web-ext` (build/run/sign/lint) | `npm run build` (zip) + `npm test` (CDP) + `tsc`/`eslint` | `scripts/`, `package.json` |
| `web-ext-types` for typings | `web-ext-types` (for `browser`) + `@types/chrome` (for `chrome`) | `jsconfig.json`, `types/globals.d.ts` |

`webextension-polyfill` (`deps/browser-polyfill.js`) is loaded first in every
context, so the shared code keeps using the promise-based `browser.*` API.

---

## 3. Architecture

### 3.1 High-level diagram

```
                     storage.local  ──────────────────────────────┐
                          ▲   │                                   │
      storage.onChanged   │   │ get(null)/set()                   │
                          │   ▼                                   │
   ┌──────────────────────────────────────────┐                   │
   │        MV3 Service Worker                 │                  │
   │        background/worker.js               │                  │
   │                                           │                  │
   │  initialize() ─► loadOptions()            │                  │
   │       │              │                    │                  │
   │       ▼              ▼                    │                  │
   │  applyRandomMode()   reconfigure() ◄──────┼── debounce        │
   │       │              │  │  │              │                   │
   │       │              │  │  └─► updateBrowserAction()          │
   │       │              │  └────► updateContentScripts()         │
   │       │              └───────► __background_dnr.buildRules()  │
   │       │                                   │                  │
   │       └─ chrome.alarms ──► applyRandomMode()                  │
   └───────────────┬───────────────────────────┬──────────────────┘
                   │ updateDynamicRules         │ registerContentScripts
                   ▼                            ▼
   ┌───────────────────────────┐   ┌──────────────────────────────────┐
   │ chrome.declarativeNet-    │   │ MAIN-world content script         │
   │ Request (request+response │   │ content/navigator-override.js     │
   │ headers)                  │   │ (document_start, all frames)      │
   └──────────────┬────────────┘   └──────────────┬───────────────────┘
                  │ response: Server-Timing        │ reads the payload
                  │ request:  User-Agent           │ synchronously from
                  ▼                                │ the Performance Timeline
              the page ◄───────────────────────────┘
```

### 3.2 Request-processing flow

1. The **service worker** builds the declarativeNetRequest rule set on
   startup/config change (`background/dnr.js`).
2. For a document a rule fires that:
   - rewrites the `User-Agent` **request** header;
   - sets the `Server-Timing: uasw-config;dur=0;desc="<...>"` **response** header
     containing the URL-encoded JSON `navigator.*` data set for that UA.
3. At `document_start`, `content/navigator-override.js` runs in the page's
   **MAIN world**. It reads `Server-Timing` synchronously from
   `performance.getEntriesByType("navigation")`, decodes the JSON, patches the
   `navigator` properties on `Navigator.prototype`, and **strips the marker**
   from the Performance Timeline (so a page cannot detect the extension).

Why it is done this way: a content script in `world: "MAIN"` has **no access to
`chrome.*`**, and an asynchronous `chrome.storage` read does not complete before
the page's inline scripts run. `Server-Timing` is a way to hand the config to
the page context synchronously.

### 3.3 Components

#### `manifest.json` (MV3)

- `background.service_worker = background/worker.js` (classic worker, not ESM).
- `action` (popup + icons), `options_ui` (`ui/options/index.html`, `open_in_tab: true`).
- `permissions`: `storage`, `tabs`, `webNavigation`, `scripting`, `alarms`,
  `declarativeNetRequestWithHostAccess`.
- `host_permissions`: `<all_urls>`.
- `default_locale: en`, version `1.4.0`.

#### `background/worker.js` — the brain (service worker)

Key entities and functions:

- `OPTIONS_DEFAULT` — defaults for all options (mirrors the original).
- `RESOURCE_TYPES` / `DOCUMENT_TYPES` — DNR `resourceTypes` sets
  (`DOCUMENT_TYPES = ["main_frame","sub_frame"]`).
- `parsedCache: Map<ua, dataSet>` — parsed BrowsCap data.
- `loadOptions()` — reads storage, runs migrations and (if needed) re-reads the
  default UA list from `assets/user-agents.txt`. It writes **only the keys that
  actually changed** back to storage (to avoid needless `storage.onChanged`
  churn).
- `preparseUserAgent(ua)` — `utils.uaparser.UserAgentParser.parse(ua)` →
  `asObject()` + a `chromium` flag (used to hide `navigator.userAgentData`).
- `reconfigure()` — reads all of storage, builds `MatchingEngine("override")`,
  collects override items, pre-parses all UAs, calls `buildRules()`,
  `updateDynamicRules()`, `updateContentScripts()` and `updateBrowserAction()`.
- `scheduleReconfigure()` — debounce (`reconfigureRunning`/`reconfigureQueued`).
- `updateContentScripts(active)` — (un)registers the content script with the
  fixed `id = CONTENT_SCRIPT_ID = "navigator-override"`.
- `applyRandomMode()` — picks a random UA, writes `current`, and for `timed`
  mode creates the `RANDOM_ALARM = "uasw-random"` alarm.
- `generateIconBadgeText()` / `generateIconTitle()` / `setBrowserAction()` —
  icon/title/badge via `chrome.action.*`.
- `navigationListener(details)` — per-tab icon/title reflecting the override for
  the top frame (`webNavigation.onCommitted`).
- `applyOptionChanges(changes)` — reacts to `storage.onChanged`:
  `random-*` → reschedule random; `current` / `show-badge-text` / `override:*`
  → `scheduleReconfigure()`.
- `onConnect(port)` — the popup asks to freeze change processing
  (`suspend-option-processing` / `resume-option-processing`) so rules are not
  rebuilt on every edit.

Initialization (top-level):

```
initialize()  →  addListeners:
  browser.storage.onChanged
  browser.runtime.onConnect
  chrome.alarms.onAlarm
  chrome.webNavigation.onCommitted (url: http/https/ftp)
  browser.runtime.onStartup
  browser.runtime.onInstalled
```

> ⚠️ The service worker can be terminated at any time. Never keep the only copy
> of state in memory: `reconfigure()` always re-reads storage. Every SW start
> runs the top-level code again and re-attaches the listeners.

#### `background/dnr.js` — rule generator

Exposes the global `__background_dnr = { buildRules, isChromiumUserAgent, METRIC_NAME }`.

Constants:

- `METRIC_NAME = "uasw-config"`;
- `GLOBAL_NET_ID = 1`, `GLOBAL_JS_ID = 2`;
- `OVERRIDE_ID_BASE = 100`, `MAX_OVERRIDES = 2000`;
- `PRIORITY_GLOBAL = 1`, `PRIORITY_OVERRIDE = 2`.

`buildRules({ current, overrides, parsedCache, resourceTypes, documentTypes })`:

- Global rules (when `current` is set):
  - `GLOBAL_NET_ID` — set request `user-agent`; `condition.resourceTypes = all`.
  - `GLOBAL_JS_ID` — set response `Server-Timing` with the payload; documents only.
- Per-override rules (2 per item):
  - `initiatorDomains: [host]`, `excludedResourceTypes: documents` → request UA
    (sub-resources of a page on that domain);
  - `requestDomains: [host]`, documents → request UA **and** response
    `Server-Timing` (the document itself).
- Payload: `` `uasw-config;dur=0;desc="${encodeURIComponent(JSON.stringify(dataSet))}"` ``.

DNR caveats to remember:

- `requestDomains`/`initiatorDomains` **include sub-domains** — exact host and
  wildcard collapse into one behavior.
- **Ports are not supported** by DNR — the `MatchingPattern.port` part is ignored.
- When rules modify the same header, `priority` decides (override > global).

#### `content/navigator-override.js` — MAIN world

- `readConfig()` — looks for a `PerformanceNavigationTiming.serverTiming` entry
  with `name === "uasw-config"` and decodes it.
- `overrideNavigatorData(dataSet)` — installs getters on `Navigator.prototype`
  for `userAgent, appVersion, platform, product, productSub, vendor, vendorSub`
  (only when the value is a string). The getters mimic native ones (`name`,
  `toString`), and the value lives on the prototype (not as an own property), so
  `Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent").get.call(navigator)`
  does not reveal the real value.
- If `dataSet.chromium === false`, `navigator.userAgentData` is hidden (a real
  Chromium-only API would otherwise contradict the spoofed UA).
- `hideMarker()` — patches the `serverTiming` getter on
  `PerformanceNavigationTiming`/`PerformanceResourceTiming` to remove
  `uasw-config` from the output.
- Re-application guard: `window.pageHasOverride`.

#### `utils/` — shared code (carried over almost unchanged)

| File | Role |
|---|---|
| `index.js` | Global `utils = { config, matchingengine, uaparser }` (built from `typeof __utils_*`). |
| `config.js` | `TextEntryParser` (the `assets/user-agents.txt` format), `StorageArray`, `TextEntryCategories`. |
| `matching-engine.js` | `MatchingPattern` (+ converters to match-pattern/glob/url-filter) and `MatchingEngine` (stores overrides in `storage.local` under `override:<baseDomain>` keys). Uses the `psl` global. |
| `uaparser.js` | BrowsCap wrapper: `UserAgentParser.parse(ua).then(p => p.asObject())`; computes `platform/appVersion/vendor/productSub/…`. Returns `null` where `require` is unavailable. |
| `polyfill.js` | `Object.fromEntries` (+ an added `console.exception` shim). |
| `l10n.js` | Translates `data-l10n-id` via `browser.i18n`. |

#### `deps/`

Third-party sources are linked as **git submodules** (same model as the
original project); only the artifacts upstream does not ship are committed:

- **Submodules (sources):** `browscap/browscap-js`, `browscap/{md5,charenc,crypt,is-buffer,synchronous-promise}`,
  `public-suffix-list`, `wext-options`, `webextension-polyfill`.
- `browscap.js` — browserify bundle (committed) that defines a **global `require`**,
  through which `utils/uaparser.js` obtains the `"browscap"` module. Rebuild: `deps/update-browscap.sh`.
- `browser-polyfill.js` — committed build of `webextension-polyfill` (upstream does
  not commit `dist/`). Rebuild: `deps/update-browser-polyfill.sh`.
- `browscap-json-cache-files/build/sources/*.json` — BrowsCap data (276 files,
  committed), read via `fetch(chrome.runtime.getURL(...))`.
- `psl.js` is **not** copied: the popup/worker reference
  `deps/public-suffix-list/dist/psl.js` inside the submodule (global `psl`).
- `wext-options/options.js` + `options.css` are referenced in place from the
  submodule; they bind `[data-option]` elements to `storage.local`.
- `browscap-js-cache-fetch/` and `update-browscap.sh` are build-only helpers.

Submodules must be initialised after cloning: `npm run submodules`
(=`git submodule update --init --recursive`).

#### UI

- `ui/popup/index.html` + `index.js` + `scripts/*` — the popup:
  - `scripts/collapsible.js`, `agent-list.js`, `override.js`, `random-mode.js`,
    `index.js` (assembles the `popup` global).
  - `index.js` — connects to the SW (`runtime.connect`, suspend/resume), renders
    the agent list, override and random mode, and opens the options page.
- `ui/options/index.html` + `index.js` — the options page: UA table/text view,
  reset to defaults, `wext-options` bindings.
- `ui/common/browser-style.css` — a partial re-implementation of Firefox's
  `browser_style` (Chrome does not provide it).

#### `assets/`

- `user-agents.txt` — the default UA list (parsed by `TextEntryParser`).
- `user-agents.tpl`, `preset-lists/*` — generation/presets (tooling).
- `icon.svg`, `icon-disabled.svg`, `icon-random.svg`, `icon-override.svg`,
  `icon-override-disabled.svg` — the **sources** (Firefox SVG).
- `icons/<name>-{16,32,48,128}.png` — generated PNGs for Chrome.

---

## 4. Storage schema (`browser.storage.local`)

| Key | Type | Meaning |
|---|---|---|
| `current` | `string \| null` | The selected global UA. |
| `available` | `Entry[]` | UA entries (`user-agent` / `comment` / `empty` / `invalid`). |
| `available-changed` | `boolean` | The user edited the list (then the default is not re-read). |
| `default-list-version` | `string` | Version at which the default list was refreshed. |
| `random-enabled` | `boolean` | Whether random mode is on. |
| `random-categories` | `string[]` | Categories used for random. |
| `random-interval` | `{mode:"startup"\|"timed", value:number, unit:"m"\|"h"\|"d"}` | Interval. |
| `random-jitter` | `number` | ± % timer spread. |
| `show-badge-text` | `boolean` | Whether to show badge text. |
| `override-popup-size` | `boolean` | Force the popup font size. |
| `popup-collapsed` | `string[]` | Collapsed categories. |
| `edit-mode` | `"table"\|"text"` | Options page view. |
| `override:<baseDomain>` | `{ [patternString]: { pattern, content:{userAgent} } }` | Per-site overrides (`MatchingEngine`, topic `"override"`). |

`available` entry shapes: `{type:"user-agent", enabled, label, category, string}`,
`{type:"comment", text}`, `{type:"empty"}`, `{type:"invalid", text}`.

---

## 5. Development

### 5.1 Requirements

- Node.js (v24 was used) + npm.
- Chromium/Chrome(-for-Testing) for `npm test` and `npm run icons`.
- Windows is the primary target of the scripts (they are cross-platform).

```sh
cd D:\Sources\user-agent-switcher-chrome
git submodule update --init --recursive   # or `npm run submodules`
npm install
```

### 5.2 Loading the extension

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the project root.

> Branded Chrome/Edge **block** `--load-extension` (used only by the automated
> tests). Loading unpacked through the UI works fine.

### 5.3 Scripts (`package.json`)

| Script | What it does |
|---|---|
| `npm run typecheck` | `tsc -p jsconfig.json` (checkJs + strict, no emit). |
| `npm run lint` | `eslint .` (original rules + Chrome globals). |
| `npm test` | CDP smoke test (see §6). |
| `npm run build` | `dist/user-agent-switcher-chrome-<version>.zip` (custom ZIP writer). |
| `npm run icons` | SVG → PNG into `assets/icons/` via headless Chrome. |
| `npm run browser:install` | Download Chrome for Testing (`@puppeteer/browsers`). |

### 5.4 Type-checking and linting (important — do not break)

- `jsconfig.json`: `allowJs`, `checkJs`, `strict`, `noEmit`, `skipLibCheck: true`,
  `types: []` (automatic `@types` inclusion disabled), with `@types/chrome` and
  `web-ext-types` included explicitly, and `lib` containing both `dom` **and**
  `webworker`.
- `types/globals.d.ts` declares:
  - the globals `__utils_config`, `__utils_matchingengine`, `__utils_uaparser`,
    `__popup_*` (the shared code builds `utils`/`popup` from them at runtime);
  - `console.exception`, `NodeSelector`, `Window.pageHasOverride`;
  - the **value** `__utils_matchingengine` typed with the constructors
    `MatchingEngine` / `MatchingPattern` / `URLUtils`.
- In `.d.ts` files **types** are `interface`/`type` (namespace) and **class
  values** are `class` inside a namespace. Important pitfall: **do not add a
  `class` to the `utils.matchingengine` namespace** — that makes the namespace
  "instantiated" and breaks the `const utils` + `namespace utils` merge
  (`Namespace 'utils' has no exported member 'matchingengine'`). That is why
  `MatchingEngine` is an `interface` and its constructor lives on the
  `__utils_matchingengine` global.
- `skipLibCheck: true` hides errors **inside** `.d.ts`. Do not treat it as
  verification — validate `.d.ts` edits with `npm run typecheck` at the use sites.
- `.eslintrc.json`: `env` includes `worker`; `globals` contains only `chrome` and
  `importScripts`. Other globals (`utils`, `psl`, `__popup_*`, …) are declared by
  inline `/* global … */` comments in the files that need them. Do not add them
  to `globals` — you will get `no-redeclare` in the files that declare them.
  `utils/browser-polyfill.js` and `deps/` are in `ignorePatterns`.

### 5.5 Code conventions

- Tabs for indentation, double quotes, semicolons (`curly` is required).
- An IIFE module has its body **at column 0** (`outerIIFEBody: 0`), as in
  `utils/config.js` / `background/dnr.js` / `content/navigator-override.js`.
- Types via JSDoc (`@param`, `@returns`, `@type`), no `.ts` emit.
- Console: `info/warn/error/exception/group/groupCollapsed/groupEnd/table` are allowed.
- User-facing strings live in `_locales/<lang>/messages.json`, accessed through
  `browser.i18n.getMessage`. If a message contains `$PLACEHOLDER$`, it **must** be
  declared under `placeholders` (otherwise Chrome refuses to load the extension —
  this is exactly how `$HOSTNAME$` broke it).

---

## 6. Testing

`npm test` runs `scripts/test.mjs` — an end-to-end smoke test over the DevTools
protocol.

Browser selection:

- by default the script finds Chrome/Chromium itself (Program Files,
  `~/.cache/puppeteer`, `UASW_CHROME`) and starts it headless with
  `--load-extension`;
- `UASW_CHROME=<path>` — point to a specific binary;
- `UASW_CDP_PORT=<port>` — do **not** spawn a browser, connect to an already
  running one (it must have been started with `--remote-debugging-port` and the
  extension loaded).

For automated runs use **Chrome for Testing** (branded builds block
`--load-extension`):

```sh
npm run browser:install
UASW_CHROME=<path> npm test
# or
UASW_CDP_PORT=9222 npm test
```

What is asserted (21 checks):

- the service worker boots, the `browser` polyfill and `utils` are available,
  the manifest version is correct;
- storage is initialized and the default UA list is loaded;
- DNR rules are built (request `user-agent` + response `Server-Timing`);
- the MAIN-world content script is registered (`document_start`);
- on a live page (`https://example.com`) `navigator.userAgent` and
  `navigator.platform` are actually spoofed;
- the `uasw-config` marker is hidden from the Performance Timeline;
- after adding an override, `initiatorDomains` and `requestDomains` rules appear;
- the popup reaches `loadingstate=done` and fills its list; the options page fills
  its table;
- there are **no** exceptions in the SW, popup or options.

How the test works: `node:http` → `/json/list`, WebSocket → CDP
`Runtime.evaluate`, `Target.createTarget` for extension pages. Checks print
`PASS/FAIL`; the summary is `RESULT: OK/FAIL` with exit code 0/1.

**Manual check** (without the test): load unpacked, pick a UA, open
`https://www.whatismybrowser.com/detect/what-is-my-user-agent/` (header) and type
`navigator.userAgent` in the console (JS spoofing).

---

## 7. File map

```
manifest.json                     MV3 manifest
background/
  worker.js                       service worker (orchestration)
  dnr.js                          DNR rule generator (__background_dnr)
content/
  navigator-override.js           MAIN-world navigator.* spoofing
utils/                            shared code (from the original) + .d.ts
deps/                             submodules (sources) + committed artifacts
                                  (browscap.js, browser-polyfill.js, BrowsCap data)
ui/
  popup/                          popup (html/js/scripts + .d.ts)
  options/                        options page
  common/browser-style.css        Chrome styles
assets/
  user-agents.txt                 default list
  icon*.svg / icons/*.png         icons (SVG sources + PNGs for Chrome)
_locales/<lang>/messages.json     38 languages
types/globals.d.ts                type shims and globals
scripts/
  test.mjs                        CDP smoke test (npm test)
  build.mjs                       ZIP packaging (npm run build)
  build-icons.mjs                 SVG → PNG (npm run icons)
  user-agent-update.py            UA list updater (from the original)
jsconfig.json .eslintrc.json .editorconfig
package.json package-lock.json    dev tooling
.vscode/tasks.json                tasks: typecheck/lint/test/build/icons
dist/                             build artifacts (gitignored)
```

---

## 8. Common tasks (recipes)

**Add/fix the default UA list.**
Edit `assets/user-agents.txt` and bump the `version` in `manifest.json` (so
`loadOptions()` re-reads the list, since `default-list-version !== version`).
Alternatively clear `available-changed`.

**Change the set of spoofed `navigator.*` properties.**
`PROPERTY_NAMES` in `content/navigator-override.js` + fields in
`UserAgentParser.asObject()` (`utils/uaparser.js`). Note that not all properties
exist natively in Chrome (`buildID`, `oscpu`, `cpuClass` are Firefox/IE-only).

**Change DNR rule parameters.**
`background/dnr.js` (priorities, ids, `resourceTypes`). Make sure
`chrome.declarativeNetRequest.updateDynamicRules` never gets two rules with the
same id and that `addRules` passes validation.

**Add an option.**
1) a key in `OPTIONS_DEFAULT` (`background/worker.js`); 2) handling in
`applyOptionChanges`; 3) UI (popup/options) + a string in `_locales/en/messages.json`.

**Add a localized string with a substitution.**
In `messages.json`: `"message": "…$NAME$…", "placeholders": {"NAME": {"content": "$1"}}`.

**Regenerate icons.** `npm run icons` (needs Chrome/Chromium; `UASW_CHROME` for an
explicit path).

**Build a release.** `npm run build` → `dist/*.zip`. The `scripts/`, `types/`,
`.d.ts` files, type/lint configs and `node_modules` are excluded from the package
(see `isExcluded` in `scripts/build.mjs`).

---

## 9. Known limitations (intentional)

- **Client Hints.** `navigator.userAgentData` is hidden for non-Chromium spoofs
  but not regenerated for Chromium spoofs.
- **Ports.** DNR cannot match a port, so the `MatchingPattern.port` part is
  dropped. Exact host and wildcard collapse (`requestDomains` includes sub-domains).
- **`about:blank` / `srcdoc` frames** get no network response → no `Server-Timing`
  → their `navigator` is not overridden.
- **`Server-Timing`** is set with the `set` operation (not `append`), i.e. it
  replaces the server value on documents.
- **Per-tab spoofing** is limited: only the icon/title per tab is implemented
  (`navigationListener`); true per-tab UA selection via `tabIds` is not.

## 10. Gotchas / "don't break this"

- `chrome.action.setIcon` in the service worker accepts **only root-absolute**
  paths (`/assets/icons/...png`). Relative paths fail with `Failed to fetch`.
- `chrome.action.setTitle/setIcon/...` **reject `tabId: undefined`** — pass an
  object without `tabId` for the global action.
- `webextension-polyfill` must load **first**: via `importScripts` in the SW and
  via `<script>` in popup/options, before the other scripts.
- `deps/browscap.js` defines a global `require`; without it `utils/uaparser.js`
  returns `null` and navigator spoofing gets no data.
- `loadOptions()` deliberately writes only changed keys to storage — otherwise the
  popup loops on `storage.onChanged("available")`.
- Do not keep the only state in SW memory — it is terminated; `reconfigure()`
  always reads storage.
- A locale without a declared `placeholders` entry **breaks loading of the whole
  extension**.
- `jsconfig.json` with `types: []` requires `@types/chrome` to be included explicitly.
- Do not add a `class` to the `utils.matchingengine` namespace (see §5.4).

---

## 11. References

- `README.md` — short user-facing description and instructions.
- `LICENSE.md` — GPL-3.0-or-later.
- Original: `D:\Sources\Empty\user-agent-switcher` (Firefox MV2) and
  https://gitlab.com/ntninja/user-agent-switcher
- Chrome DNR: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- `world: "MAIN"` content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
