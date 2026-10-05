// End-to-end smoke test for the Chrome port.
//
// Loads the unpacked extension into a Chromium-based browser and, through the
// DevTools protocol, verifies that:
//   * the MV3 service worker boots without exceptions
//   * declarativeNetRequest rules and the MAIN-world content script get set up
//   * navigator.userAgent is really spoofed on a live page
//   * the Server-Timing bridge marker is hidden from the page
//   * per-domain override rules are generated
//   * the popup and options pages load without errors
//
// Browser selection:
//   * UASW_CHROME  – path to a Chromium/Chrome(-for-Testing) executable
//   * UASW_CDP_PORT – connect to an already running browser on this port
//                     instead of spawning one
//
// Chrome for Testing (which allows `--load-extension`, unlike the branded
// build) can be fetched with `npm run browser:install`.

import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, "..");
const MANIFEST_VERSION = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version;
const PORT = Number(process.env.UASW_CDP_PORT) || 9333;
const EXTERNAL = !!process.env.UASW_CDP_PORT;
const TARGET_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0";
const OVERRIDE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * @returns {string?} Path to a usable Chromium executable
 */
function findChrome() {
	if (process.env.UASW_CHROME) {
		return existsSync(process.env.UASW_CHROME) ? process.env.UASW_CHROME : null;
	}

	const candidates = [];
	const pf = process.env["ProgramFiles"];
	const pf86 = process.env["ProgramFiles(x86)"];
	if (pf) {
		candidates.push(join(pf, "Google", "Chrome", "Application", "chrome.exe"));
		candidates.push(join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
	}
	if (pf86) {
		candidates.push(join(pf86, "Google", "Chrome", "Application", "chrome.exe"));
		candidates.push(join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
	}
	candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");

	// Chrome for Testing installed through @puppeteer/browsers
	const home = process.env.USERPROFILE || process.env.HOME;
	for (const cacheRoot of [
		process.env.PUPPETEER_CACHE_DIR,
		home && join(home, ".cache", "puppeteer"),
		home && join(home, "AppData", "Local", "puppeteer"),
	].filter(Boolean)) {
		try {
			for (const browser of readdirSync(join(cacheRoot, "chrome"), { withFileTypes: true })) {
				if (!browser.isDirectory()) continue;
				const platformDir = join(cacheRoot, "chrome", browser.name);
				for (const build of readdirSync(platformDir)) {
					for (const exe of ["chrome.exe", "chrome"]) {
						const candidate = join(platformDir, build, exe);
						if (existsSync(candidate) && statSync(candidate).isFile()) {
							candidates.push(candidate);
						}
					}
				}
			}
		} catch(_) { /* cache directory not present */ }
	}

	return candidates.find((candidate) => existsSync(candidate)) || null;
}

let chrome = null;
let chromeLog = "";
const profile = join(process.env.TEMP || process.env.TMPDIR || ".", `uasw-test-${Date.now()}`);

if (!EXTERNAL) {
	const executable = findChrome();
	if (!executable) {
		console.error("No Chromium/Chrome executable found.");
		console.error("Install Chrome for Testing with `npm run browser:install` and set UASW_CHROME,");
		console.error("or start a browser yourself and set UASW_CDP_PORT.");
		process.exit(2);
	}
	console.log("browser:", executable);
	chrome = spawn(executable, [
		"--headless=new",
		"--disable-gpu",
		"--no-sandbox",
		"--no-first-run",
		"--no-default-browser-check",
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${profile}`,
		`--load-extension=${EXT}`,
		"--window-size=420,640",
		"about:blank",
	], { stdio: ["ignore", "pipe", "pipe"] });
	chrome.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
}

function cleanup() {
	if (chrome) {
		try { chrome.kill("SIGKILL"); } catch(_) { /* ignored */ }
	}
	try { rmSync(profile, { recursive: true, force: true }); } catch(_) { /* ignored */ }
}
process.on("exit", cleanup);

function cdpHttp(method, path) {
	return new Promise((resolvePromise, reject) => {
		const req = httpRequest({ host: "127.0.0.1", port: PORT, method, path }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => { body += chunk; });
			res.on("end", () => resolvePromise(body));
		});
		req.on("error", reject);
		req.end();
	});
}

async function cdpList() {
	return JSON.parse(await cdpHttp("GET", "/json/list"));
}

async function waitTarget(predicate, timeoutMs = 25000) {
	const start = Date.now();
	let lastError;
	while (Date.now() - start < timeoutMs) {
		try {
			const found = (await cdpList()).find(predicate);
			if (found) return found;
		} catch(error) { lastError = error; }
		await sleep(300);
	}
	throw new Error((lastError ? lastError.message : "timeout") + "\n" + chromeLog.slice(-2000));
}

class CdpClient {
	constructor(ws) {
		this.ws = ws;
		this.nextId = 0;
		this.pending = new Map();
		this.events = [];
		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.id && this.pending.has(message.id)) {
				const resolvePromise = this.pending.get(message.id);
				this.pending.delete(message.id);
				resolvePromise(message);
			} else {
				this.events.push(message);
			}
		};
	}
	send(method, params = {}) {
		const id = ++this.nextId;
		return new Promise((resolvePromise) => {
			this.pending.set(id, resolvePromise);
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
}

async function connect(url) {
	const ws = new WebSocket(url);
	await new Promise((resolvePromise, reject) => {
		ws.onopen = resolvePromise;
		ws.onerror = reject;
	});
	return new CdpClient(ws);
}

async function evaluate(client, expression) {
	const reply = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
	const inner = reply.result || {};
	if (inner.exceptionDetails) {
		throw new Error("Evaluation failed: " + JSON.stringify(inner.exceptionDetails));
	}
	return inner.result ? inner.result.value : undefined;
}

let failed = false;
const check = (label, condition, detail = "") => {
	console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? "  ->  " + detail : ""}`);
	if (!condition) failed = true;
};

try {
	const swTarget = await waitTarget((t) => t.type === "service_worker" && t.url.includes("background/worker.js"));
	console.log("service worker:", swTarget.url);

	const sw = await connect(swTarget.webSocketDebuggerUrl);
	await sw.send("Runtime.enable");
	await sw.send("Log.enable");
	await sleep(2500);

	check("browser polyfill present", (await evaluate(sw, "typeof browser")) === "object");
	check("shared utils loaded", (await evaluate(sw, "typeof utils")) === "object");
	check("manifest version", (await evaluate(sw, "chrome.runtime.getManifest().version")) === MANIFEST_VERSION);

	const keys = await evaluate(sw, "browser.storage.local.get(null).then(o => Object.keys(o).sort().join(','))");
	check("storage initialized", keys.includes("available") && keys.includes("current"), keys);

	const availableLen = await evaluate(sw, "browser.storage.local.get('available').then(o => o.available.length)");
	check("default UA list loaded", availableLen > 0, `entries=${availableLen}`);

	await evaluate(sw, `browser.storage.local.set({current:${JSON.stringify(TARGET_UA)}}).then(() => true)`);
	await sleep(1800);

	const rules = JSON.parse(await evaluate(sw, "chrome.declarativeNetRequest.getDynamicRules().then(r => JSON.stringify(r))"));
	check("global DNR rules exist", rules.length >= 2, `rules=${rules.length}`);
	check("User-Agent request rule", rules.some((r) => r.action.requestHeaders?.some((h) => h.header === "user-agent")));
	check("Server-Timing response rule", rules.some((r) => r.action.responseHeaders?.some((h) => h.header === "Server-Timing")));

	const scripts = JSON.parse(await evaluate(sw, "chrome.scripting.getRegisteredContentScripts().then(s => JSON.stringify(s))"));
	check("MAIN-world content script registered",
		scripts.length === 1 && scripts[0].world === "MAIN" && scripts[0].runAt === "document_start",
		JSON.stringify(scripts.map((s) => ({ id: s.id, world: s.world, runAt: s.runAt }))));

	const pageTarget = JSON.parse(await cdpHttp("PUT", "/json/new?" + encodeURIComponent("https://example.com/")));
	const page = await connect(pageTarget.webSocketDebuggerUrl);
	await page.send("Runtime.enable");
	await sleep(4000);

	check("navigator.userAgent spoofed on live page", (await evaluate(page, "navigator.userAgent")) === TARGET_UA, await evaluate(page, "navigator.userAgent"));
	check("navigator.platform spoofed", String(await evaluate(page, "navigator.platform")).startsWith("Linux"), await evaluate(page, "navigator.platform"));
	const marker = await evaluate(page, "(performance.getEntriesByType('navigation')[0].serverTiming || []).map(t => t.name).join(',')");
	check("Server-Timing marker hidden from page", !String(marker).includes("uasw-config"), "marker=[" + marker + "]");

	await evaluate(sw, `(async () => {
		const engine = new utils.matchingengine.MatchingEngine("override", null);
		await engine.putItem({
			pattern: { hostname: "example.com", protocol: "https:", port: null, isWildcard: true },
			content: { userAgent: ${JSON.stringify(OVERRIDE_UA)} }
		});
		return "ok";
	})()`);
	await sleep(1800);
	const overrideRules = JSON.parse(await evaluate(sw, "chrome.declarativeNetRequest.getDynamicRules().then(r => JSON.stringify(r))"));
	check("override: initiator rule created", overrideRules.some((r) => r.condition.initiatorDomains?.includes("example.com")));
	check("override: document rule created", overrideRules.some((r) => r.condition.requestDomains?.includes("example.com")));

	const extId = new URL(swTarget.url).host;
	const browserWs = JSON.parse(await cdpHttp("GET", "/json/version")).webSocketDebuggerUrl;

	async function openExtensionPage(path) {
		const browser = await connect(browserWs);
		const created = await browser.send("Target.createTarget", { url: `chrome-extension://${extId}/${path}` });
		await sleep(2500);
		const target = (await cdpList()).find((t) => t.id === created.result.targetId);
		const client = await connect(target.webSocketDebuggerUrl);
		await client.send("Runtime.enable");
		await sleep(2000);
		return client;
	}

	const popup = await openExtensionPage("ui/popup/index.html");
	check("popup reached 'done' state", (await evaluate(popup, "document.body.dataset.loadingstate")) === "done");
	check("popup agent list populated", (await evaluate(popup, "document.querySelectorAll('#agent-list input[type=radio]').length")) > 0);
	check("popup without exceptions", popup.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0);

	const optionsPage = await openExtensionPage("ui/options/index.html");
	check("options entries table populated", (await evaluate(optionsPage, "document.querySelectorAll('#entries-view-table tbody tr').length")) > 0);
	check("options without exceptions", optionsPage.events.filter((e) => e.method === "Runtime.exceptionThrown").length === 0);

	const swExceptions = sw.events.filter((e) => e.method === "Runtime.exceptionThrown");
	check("no service-worker exceptions", swExceptions.length === 0, `count=${swExceptions.length}`);
	if (swExceptions.length) console.log(JSON.stringify(swExceptions, null, 2));
} catch(error) {
	failed = true;
	console.error("TEST ERROR:", error && error.stack ? error.stack : error);
}

console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: OK");
cleanup();
process.exit(failed ? 1 : 0);
