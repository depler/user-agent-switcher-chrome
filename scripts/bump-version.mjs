// Increment the last numeric component of the extension version in
// `manifest.json` by one (e.g. `1.4.0` -> `1.4.1`) and print the new version.
//
// Used by `.github/workflows/build-release.yml`. The file is edited in place
// with a regex so the surrounding formatting stays untouched.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "..", "manifest.json");

const text = readFileSync(MANIFEST, "utf8");
const pattern = /("version"\s*:\s*")(\d+)((?:\.\d+)*)(")/;
const match = text.match(pattern);
if (!match) {
	console.error("bump-version: no numeric \"version\" field found in manifest.json");
	process.exit(1);
}

const [, prefix, first, rest, suffix] = match;
const parts = [first, ...rest.split(".").filter(Boolean)].map(Number);
if (parts.some((part) => !Number.isSafeInteger(part))) {
	console.error("bump-version: unexpected version format:", match[0]);
	process.exit(1);
}
parts[parts.length - 1] += 1;

const next = parts.join(".");
writeFileSync(MANIFEST, text.replace(pattern, `${prefix}${next}${suffix}`));
console.info(next);
