// Rasterize the extension's SVG icons into the PNG sizes Chrome requires.
//
// Chrome does not support SVG for extension/action icons, so the original
// Firefox artwork is rendered once with headless Chrome.
//
// A Chromium/Chrome executable can be supplied through UASW_CHROME.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ASSETS = join(ROOT, "assets");
const OUT = join(ASSETS, "icons");
const TMP = join(ROOT, ".icons-tmp");

const ICONS = {
	"icon":              "icon.svg",
	"disabled":          "icon-disabled.svg",
	"random":            "icon-random.svg",
	"override":          "icon-override.svg",
	"override-disabled": "icon-override-disabled.svg",
};
const SIZES = [16, 32, 48, 128];

function findChrome() {
	if (process.env.UASW_CHROME && existsSync(process.env.UASW_CHROME)) {
		return process.env.UASW_CHROME;
	}
	const pf = process.env["ProgramFiles"];
	const pf86 = process.env["ProgramFiles(x86)"];
	const candidates = [
		pf && join(pf, "Google", "Chrome", "Application", "chrome.exe"),
		pf86 && join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
		pf && join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
		pf86 && join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	].filter(Boolean);
	return candidates.find((candidate) => existsSync(candidate)) || null;
}

const chrome = findChrome();
if (!chrome) {
	console.error("No Chromium/Chrome executable found. Set UASW_CHROME.");
	process.exit(2);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

let failures = 0;
for (const [name, svgFile] of Object.entries(ICONS)) {
	const svg = readFileSync(join(ASSETS, svgFile));
	const dataUrl = "data:image/svg+xml;base64," + svg.toString("base64");

	for (const size of SIZES) {
		const html = `<!doctype html><meta charset="utf-8">` +
			`<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}` +
			`img{display:block;width:${size}px;height:${size}px}</style>` +
			`<img src="${dataUrl}">`;
		const htmlPath = join(TMP, `${name}-${size}.html`);
		writeFileSync(htmlPath, html, "utf8");

		const outPath = join(OUT, `${name}-${size}.png`);
		const result = spawnSync(chrome, [
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			"--no-first-run",
			"--no-default-browser-check",
			"--default-background-color=00000000",
			"--force-device-scale-factor=1",
			`--window-size=${size},${size}`,
			`--screenshot=${outPath}`,
			`--user-data-dir=${join(TMP, `profile-${name}-${size}`)}`,
			"--virtual-time-budget=3000",
			pathToFileURL(htmlPath).href,
		], { stdio: "ignore" });

		if (result.status !== 0) {
			failures += 1;
			console.error(`FAILED ${name}-${size} (exit ${result.status})`);
		} else {
			console.log(`ok ${name}-${size}.png`);
		}
	}
}

rmSync(TMP, { recursive: true, force: true });
console.log(failures === 0 ? "ALL OK" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
