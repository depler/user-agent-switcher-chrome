/*
 * User Agent Switcher (Chrome port)
 * Copyright © 2017-2020  Erin Yuki Schlarb
 * Copyright © 2026  Chrome port
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global utils, __background_dnr */
"use strict";


// Load the promise-based `browser` polyfill first; everything below (as well
// as the shared `utils/*` scripts) is written against the Firefox-style API.
importScripts(
	"/deps/browser-polyfill.js",

	"/utils/polyfill.js",
	"/deps/browscap.js",
	"/deps/public-suffix-list/dist/psl.js",
	"/utils/config.js",
	"/utils/matching-engine.js",
	"/utils/uaparser.js",
	"/utils/index.js",

	"/background/dnr.js"
);


/**
 * Default values for all options
 *
 * (Mirrors `background/main.js` of the Firefox version.)
 */
/** @type {{ [name: string]: any }} */
const OPTIONS_DEFAULT = {
	"current": null,

	"available":         [],
	"available-changed": false,

	"random-enabled":    false,
	"random-categories": [utils.config.TextEntryCategories.DESKTOP_ENGTEXT],
	"random-interval":   {mode: "startup", value: 1, unit: "h"},
	"random-jitter":     20,

	"show-badge-text":     true,
	"override-popup-size": false,
	"popup-collapsed":     [],

	"edit-mode": "table",
};

/** Storage key remembering which extension version last refreshed the list */
const DEFAULT_LIST_VERSION_KEY = "default-list-version";

/** Name of the `chrome.alarms` alarm used for timed random rotation */
const RANDOM_ALARM = "uasw-random";

/** Id of the dynamically registered `MAIN` world content script */
const CONTENT_SCRIPT_ID = "navigator-override";

/** All DNR resource types, with a conservative fallback for older Chrome */
const RESOURCE_TYPES = (() => {
try {
	const values = Object.values(chrome.declarativeNetRequest.ResourceType);
	if (values.length > 0) {
		return values;
	}
} catch(_) { /* ignored */ }
return [
	"main_frame", "sub_frame", "stylesheet", "script", "image", "font",
	"object", "xmlhttprequest", "ping", "media", "websocket", "other"
];
})();

/** Resource types that represent a navigable document */
const DOCUMENT_TYPES = ["main_frame", "sub_frame"];


/** Current options (kept in memory so navigation handling stays cheap) */
/** @type {{ [name: string]: any }} */
let currentOptions = Object.assign({}, OPTIONS_DEFAULT);

/** UA string => parsed navigator data-set */
/** @type {Map<string, object>} */
const parsedCache = new Map();

/** Tracks how many UI clients asked us to freeze option processing */
let processingLockCount = 0;

/** Debounce/queue state for {@link scheduleReconfigure} */
let reconfigureRunning = false;
let reconfigureQueued   = false;


/******************/
/* Option loading */
/******************/

/**
 * Load all options from storage, applying migrations and (re)populating the
 * default User-Agent list when necessary.
 *
 * @returns {Promise<{ [name: string]: any }>}
 */
async function loadOptions() {
	/** @type {{ [name: string]: any }} */
	const stored  = await browser.storage.local.get(null);
	/** @type {{ [name: string]: any }} */
	const options = Object.assign({}, OPTIONS_DEFAULT, stored);
	/** @type {{ [name: string]: any }} */
	const writes  = {};

	// Ensure all default keys exist in storage so the UI can rely on them
	for (const name of Object.keys(OPTIONS_DEFAULT)) {
		if (!Object.prototype.hasOwnProperty.call(stored, name)) {
			writes[name] = OPTIONS_DEFAULT[name];
		}
	}

	const entries = Array.isArray(options["available"]) ? options["available"] : null;

	if (entries) {
		let changed = false;

		//MIGRATE-1.2.1: Mark all previous User-Agent entries as enabled
		if (options["available-changed"]) {
			for (const entry of entries) {
				if (entry.type === "user-agent" && typeof(entry.enabled) !== "boolean") {
					entry.enabled = true;
					changed = true;
				}
			}
		}

		//MIGRATE-1.4: Add the default category label of "Other" where missing
		for (const entry of entries) {
			if (entry.type === "user-agent" && typeof(entry.category) !== "string") {
				entry.category = utils.config.TextEntryCategories.OTHER_ENGTEXT;
				changed = true;
			}
		}

		if (changed) {
			writes["available"] = entries;
		}
	}

	// Read the default list from file if none was found in storage or the user
	// has never edited it (so it stays up-to-date across extension updates)
	if (!options["available-changed"]) {
		const version  = chrome.runtime.getManifest().version;
		const outdated = !entries || entries.length < 1
			|| options[DEFAULT_LIST_VERSION_KEY] !== version;

		if (outdated) {
			const response = await fetch(chrome.runtime.getURL("assets/user-agents.txt"));
			const content  = await response.text();

			const parser  = new utils.config.TextEntryParser();
			const parsed  = await parser.parse(content);

			options["available"] = parsed;
			writes["available"]               = parsed;
			writes[DEFAULT_LIST_VERSION_KEY]  = version;
		}
	}

	if (Object.keys(writes).length > 0) {
		await browser.storage.local.set(writes);
	}

	// Make sure the in-memory copy seen by the caller reflects our writes
	return Object.assign(options, writes);
}


/***********************/
/* Request processing  */
/***********************/

/**
 * Ensure a parsed navigator data-set exists for the given User-Agent string
 *
 * @param {string?} userAgent
 * @returns {Promise<void>}
 */
async function preparseUserAgent(userAgent) {
	if (typeof(userAgent) !== "string" || userAgent.length < 1 || parsedCache.has(userAgent)) {
		return;
	}

	try {
		const parser = await utils.uaparser.UserAgentParser.parse(userAgent);
		const dataSet = Object.assign(parser.asObject(), {
			chromium: __background_dnr.isChromiumUserAgent(userAgent)
		});
		parsedCache.set(userAgent, dataSet);
	} catch(error) {
		console.error("[uasw] Failed to parse User-Agent:", userAgent, error);
	}
}

/**
 * Read the current options from storage and update the declarativeNetRequest
 * rules, the injected content scripts and the browser-action state.
 *
 * @returns {Promise<void>}
 */
async function reconfigure() {
	const stored  = await browser.storage.local.get(null);
	currentOptions = Object.assign({}, OPTIONS_DEFAULT, stored);

	// Collect every override data item that is currently cached in storage
	const matchingEngine = new utils.matchingengine.MatchingEngine("override", currentOptions);
	const overrides      = [...matchingEngine.enumerateCachedItems()];

	// Pre-parse all User-Agent strings that may be encountered
	const userAgents = new Set();
	if (typeof(currentOptions["current"]) === "string") {
		userAgents.add(currentOptions["current"]);
	}
	for (const item of overrides) {
		const userAgent = item && item.content ? item.content.userAgent : null;
		if (typeof(userAgent) === "string" && userAgent.length > 0) {
			userAgents.add(userAgent);
		}
	}
	for (const userAgent of userAgents) {
		await preparseUserAgent(userAgent);
	}

	// Rebuild the declarativeNetRequest ruleset
	const built = __background_dnr.buildRules({
		current:        currentOptions["current"],
		overrides:      overrides,
		parsedCache:    parsedCache,
		resourceTypes:  RESOURCE_TYPES,
		documentTypes:  DOCUMENT_TYPES
	});

	/** @type {number[]} */
	let removeRuleIds = [];
	try {
		removeRuleIds = (await chrome.declarativeNetRequest.getDynamicRules()).map((rule) => rule.id);
	} catch(error) {
		console.error("[uasw] Failed to read existing DNR rules:", error);
	}

	try {
		await chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: removeRuleIds,
			addRules:      /** @type {chrome.declarativeNetRequest.Rule[]} */ (built.rules)
		});
	} catch(error) {
		console.error("[uasw] Failed to update DNR rules:", error, built.rules);
	}

	// Register/refresh the MAIN world navigator override content script
	const wantInjection = (typeof(currentOptions["current"]) === "string"
		|| built.scope.overrides > 0);
	await updateContentScripts(wantInjection);

	// Update the browser action (icon/title/badge)
	updateBrowserAction();
}

/**
 * (Re)register or remove the MAIN world content script responsible for
 * replacing `navigator.*` inside the page.
 *
 * @param {boolean} active
 * @returns {Promise<void>}
 */
async function updateContentScripts(active) {
	try {
		const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
		if (existing.length > 0) {
			await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
		}

		if (active) {
			await chrome.scripting.registerContentScripts([{
				id:                   CONTENT_SCRIPT_ID,
				js:                   ["content/navigator-override.js"],
				matches:              ["*://*/*"],
				runAt:                "document_start",
				allFrames:            true,
				matchOriginAsFallback: true,
				world:                "MAIN"
			}]);
		}
	} catch(error) {
		console.error("[uasw] Failed to (un)register content scripts:", error);
	}
}

/**
 * Queue a {@link reconfigure} run, collapsing concurrent requests
 */
function scheduleReconfigure() {
	if (reconfigureRunning) {
		reconfigureQueued = true;
		return;
	}

	reconfigureRunning = true;
	reconfigure().catch(console.error).finally(() => {
		reconfigureRunning = false;
		if (reconfigureQueued) {
			reconfigureQueued = false;
			scheduleReconfigure();
		}
	});
}


/*******************/
/* Random UA mode  */
/*******************/

/**
 * (Re)schedule the random User-Agent rotation and pick a new value
 *
 * @returns {Promise<void>}
 */
async function applyRandomMode() {
	try {
		await chrome.alarms.clear(RANDOM_ALARM);
	} catch(_) { /* ignored */ }

	if (!currentOptions["random-enabled"]) {
		return;
	}

	const selectedCategories = Array.isArray(currentOptions["random-categories"])
		? currentOptions["random-categories"] : [];
	const entries = (Array.isArray(currentOptions["available"]) ? currentOptions["available"] : [])
		.filter((entry) => entry.type === "user-agent" && entry.enabled
			&& selectedCategories.includes(entry.category));

	if (entries.length < 1) {
		return;
	}

	// Select an entry using a poor, but good enough, random number generator
	const entry = entries[Math.floor(Math.random() * entries.length)];

	// Setting `current` triggers `storage.onChanged`, which schedules a
	// reconfigure (but not another rotation)
	await browser.storage.local.set({ "current": entry.string });

	const interval = currentOptions["random-interval"];
	if (interval && interval.mode === "timed") {
		let minutes;
		switch(interval.unit) {
			case "m": minutes = interval.value;         break;
			case "h": minutes = interval.value * 60;    break;
			case "d": minutes = interval.value * 1440;  break;
			default:  return;
		}

		// Add skew to the time value to make tracking harder when using random
		// mode in an effort of avoiding that
		const jitter = Number(currentOptions["random-jitter"]) || 0;
		minutes = minutes * (1 + (Math.random() * 2 - 1) * jitter / 100);

		// `chrome.alarms` is unreliable below one minute
		minutes = Math.max(1, minutes);

		chrome.alarms.create(RANDOM_ALARM, { delayInMinutes: minutes });
	}
}


/********************/
/* Browser action   */
/********************/

/**
 * Lookup the human-readable label of a User-Agent string
 *
 * @param {string?} userAgent
 * @returns {string?}
 */
function findEntryLabel(userAgent) {
	for (const entry of currentOptions["available"]) {
		if (entry.type === "user-agent" && entry.string === userAgent) {
			return entry.label;
		}
	}
	return null;
}

/**
 * @param {string?} userAgent
 * @returns {string}
 */
function generateIconBadgeText(userAgent) {
	if (typeof(userAgent) !== "string") {
		return "";
	}

	const entryLabel = findEntryLabel(userAgent);
	if (typeof(entryLabel) !== "string") {
		return "";
	}

	// Vary based on label style
	if (entryLabel.includes("/")) {
		// Style used by the default list: <OS> / <Browser> => O/B
		return entryLabel.split("/", 2).map((s) => s.trim().substr(0, 1)).join("/").toUpperCase();
	} else if (entryLabel.includes(" ")) {
		// More than one word: <One> <Two> <Three> => OTT
		return entryLabel.split(/\s+/g, 3).map((s) => s.substr(0, 1)).join("").toUpperCase();
	} else if (+entryLabel == parseInt(entryLabel)) {  // ← Checks if value is plain integer
		return entryLabel.substr(0, 4);
	} else {
		// Just one word: <Word> => WO
		return entryLabel.substr(0, 2).toUpperCase();
	}
}

/**
 * @param {string?} userAgent
 * @param {"default" | "random" | "override"} mode
 * @returns {string}
 */
function generateIconTitle(userAgent, mode) {
	const titleMsgID = "icon_title_"
		+ (mode === "override"
			? ("override_" + (typeof(userAgent) === "string" ? "enabled" : "disabled"))
			: (mode === "random"
				? "random"
				: (typeof(userAgent) === "string" ? "enabled" : "disabled")
			)
		);

	let title = chrome.runtime.getManifest().name + " – " + browser.i18n.getMessage(titleMsgID);
	if (typeof(userAgent) === "string") {
		const label = findEntryLabel(userAgent);
		if (typeof(label) === "string") {
			title += " (" + label + ")";
		}
	}
	return title;
}

/**
 * @param {string?} userAgent
 * @param {"default" | "random" | "override"} mode
 * @returns {string} Base name of the icon file to use
 */
function iconNameFor(userAgent, mode) {
	if (mode === "override") {
		return typeof(userAgent) === "string" ? "override" : "override-disabled";
	} else if (mode === "random") {
		return "random";
	} else if (typeof(userAgent) === "string") {
		return "icon";
	} else {
		return "disabled";
	}
}

/**
 * @param {string?} userAgent
 * @param {"default" | "random" | "override"} mode
 * @param {number} [tabId]
 */
function setBrowserAction(userAgent, mode, tabId = undefined) {
	const options = (typeof(tabId) === "number" && tabId >= 0) ? { tabId: tabId } : {};

	// Update title
	try {
		chrome.action.setTitle(Object.assign({
			title: generateIconTitle(userAgent, mode)
		}, options));
	} catch(error) { console.error(error); }

	// Update icon
	const name = iconNameFor(userAgent, mode);
	try {
		chrome.action.setIcon(Object.assign({
			path: {
				"16":  `/assets/icons/${name}-16.png`,
				"32":  `/assets/icons/${name}-32.png`,
				"48":  `/assets/icons/${name}-48.png`,
				"128": `/assets/icons/${name}-128.png`
			}
		}, options));
	} catch(error) { console.error(error); }

	// Update badge
	try {
		if (currentOptions["show-badge-text"]) {
			const BADGE_COLORS = {
				"override": "goldenrod",
				"random":   "darkgreen",
				"default":  "darkgray",
			};
			chrome.action.setBadgeText(Object.assign({ text: generateIconBadgeText(userAgent) }, options));
			chrome.action.setBadgeBackgroundColor(Object.assign({ color: BADGE_COLORS[mode] }, options));
		} else {
			chrome.action.setBadgeText(Object.assign({ text: "" }, options));
		}
	} catch(error) { console.error(error); }
}

/**
 * Update the global browser-action state
 */
function updateBrowserAction() {
	setBrowserAction(
		currentOptions["current"],
		currentOptions["random-enabled"] ? "random" : "default"
	);
}


/********************/
/* Event handling   */
/********************/

/**
 * @param {chrome.webNavigation.WebNavigationTransitionCallbackDetails} details
 */
function navigationListener(details) {
	// Browser action only reflects state of the top-level browsing context
	if (details.frameId !== 0) {
		return;
	}

	/** @type {URL?} */
	let url = null;
	try {
		url = new URL(details.url);
	} catch(_) {
		return;
	}

	const matchingEngine = new utils.matchingengine.MatchingEngine("override", currentOptions);
	const overrideData   = matchingEngine.findItemInCache(url);

	if (overrideData) {
		setBrowserAction(overrideData.content.userAgent, "override", details.tabId);
	} else {
		setBrowserAction(
			currentOptions["current"],
			currentOptions["random-enabled"] ? "random" : "default",
			details.tabId
		);
	}
}

/**
 * @param {{ [name: string]: chrome.storage.StorageChange }} changes
 */
function applyOptionChanges(changes) {
	// Apply changes to the in-memory option copy while recording which keys
	// actually received a new value
	const changedKeys = [];

	for (const name of Object.keys(changes)) {
		if (typeof(changes[name].newValue) !== "undefined") {
			if (!Object.prototype.hasOwnProperty.call(currentOptions, name)
			|| JSON.stringify(changes[name].newValue) !== JSON.stringify(currentOptions[name])) {
				changedKeys.push(name);
			}
			currentOptions[name] = changes[name].newValue;
		} else {
			changedKeys.push(name);
			delete currentOptions[name];
		}
	}

	// Reschedule random mode when any of its options changed
	const RANDOM_KEYS = ["random-enabled", "random-categories", "random-interval", "random-jitter"];
	if (changedKeys.some((name) => RANDOM_KEYS.includes(name))) {
		applyRandomMode().catch(console.error);
	}

	const needsReconfigure = changedKeys.some((name) => {
		return name === "current"
			|| name === "show-badge-text"
			|| name.startsWith("override:");
	});

	if (needsReconfigure) {
		scheduleReconfigure();
	}
}

/**
 * @param {browser.runtime.Port} port
 */
function onConnect(port) {
	let suspendsOptionProcessing = false;

	function resumeOptionProcessing() {
		if (suspendsOptionProcessing) {
			suspendsOptionProcessing = false;
			try { port.onDisconnect.removeListener(resumeOptionProcessing); } catch(_) { /* ignored */ }

			processingLockCount--;
			if (processingLockCount < 1) {
				processingLockCount = 0;
				scheduleReconfigure();
			}
		}
	}

	port.onMessage.addListener((message) => {
		const request = /** @type {{ request?: string }} */ (message).request;

		if (typeof(request) !== "string") {
			return;
		}

		switch(request) {
			case "suspend-option-processing":
				if (!suspendsOptionProcessing) {
					suspendsOptionProcessing = true;
					processingLockCount++;
					try { port.onDisconnect.addListener(resumeOptionProcessing); } catch(_) { /* ignored */ }
				}
				break;

			case "resume-option-processing":
				resumeOptionProcessing();
				break;
		}
	});
}


/***************/
/* Bootstrap   */
/***************/

/**
 * @returns {Promise<void>}
 */
async function initialize() {
	currentOptions = await loadOptions();

	// Apply the random mode selection for this session
	await applyRandomMode();

	// Build the initial rules/injection state
	await reconfigure();
}

initialize().then(() => {
	// Keep track of new developments in option land
	browser.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "local") {
			return;
		}

		if (processingLockCount < 1) {
			applyOptionChanges(changes);
		}
		// While the popup is open we deliberately ignore changes; the popup
		// sends "resume-option-processing" when it closes, which triggers a
		// full reconfigure.
	});

	// Popup/UIs may request us to freeze option processing
	browser.runtime.onConnect.addListener(onConnect);

	// Timed random rotation
	chrome.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === RANDOM_ALARM) {
			applyRandomMode().catch(console.error);
		}
	});

	// Per-tab browser-action overrides
	chrome.webNavigation.onCommitted.addListener(navigationListener, {
		url: [{ schemes: ["http", "https", "ftp"] }]
	});

	// Pick a fresh User-Agent on browser startup when in "startup" mode
	browser.runtime.onStartup.addListener(() => {
		applyRandomMode().catch(console.error);
	});

	// Re-run migrations/default refresh when the extension is updated
	browser.runtime.onInstalled.addListener(() => {
		initialize().catch(console.error);
	});
}).catch(console.error);
