// Package the extension into a distributable ZIP in `dist/`.
//
// The Chrome Web Store accepts a ZIP of the extension directory; development
// files (`node_modules`, lint/type configs, `.d.ts`, the scripts themselves,
// …) are left out.

import { readFileSync, readdirSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const EXCLUDE_ANY_DIR = new Set(["node_modules", ".git", ".vscode", "chrome"]);
const EXCLUDE_TOP_DIR = new Set(["dist", "scripts", "types", "docs", "screenshots"]);
const EXCLUDE_FILES = new Set([
	"package.json", "package-lock.json", "jsconfig.json", "tsconfig.json",
	"wikidata-api-secret.txt",
]);

// `deps/` submodules (source only) and build helpers that must not be shipped
const EXCLUDE_PREFIXES = [
	"deps/browscap/",              // source modules behind the committed browscap.js bundle
	"deps/browscap-js-cache-fetch/",
	"deps/webextension-polyfill/", // source module behind the committed browser-polyfill.js
];
const EXCLUDE_DEPS_FILES = new Set([
	"deps/update-browscap.sh",
	"deps/update-browser-polyfill.sh",
]);

// From these submodules only the listed files are shipped (the rest is source)
const KEEP_ONLY = new Map([
	["deps/public-suffix-list", new Set(["dist/psl.js"])],
	["deps/wext-options", new Set(["options.js", "options.css"])],
]);

function isExcluded(relativePath) {
	const parts = relativePath.split(/[\\/]/);
	if (parts.some((part) => EXCLUDE_ANY_DIR.has(part))) return true;
	if (EXCLUDE_TOP_DIR.has(parts[0])) return true;

	const rel = parts.join("/");
	if (EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true;
	if (EXCLUDE_DEPS_FILES.has(rel)) return true;

	for (const [dir, allowed] of KEEP_ONLY) {
		if (!rel.startsWith(`${dir}/`)) continue;
		const remainder = rel.slice(dir.length + 1);
		const isAllowedFile = allowed.has(remainder);
		const isParentDir = [...allowed].some((entry) => entry.startsWith(`${remainder}/`));
		if (!isAllowedFile && !isParentDir) {
			return true;
		}
	}

	const base = parts[parts.length - 1];
	if (base.startsWith(".")) return true;
	if (base.endsWith(".ts")) return true;          // includes declaration files
	if (base.endsWith(".map")) return true;
	if (EXCLUDE_FILES.has(base)) return true;
	return false;
}

function collectFiles(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const absolute = join(dir, entry.name);
		const relativePath = relative(ROOT, absolute);
		if (isExcluded(relativePath)) continue;
		if (entry.isDirectory()) {
			collectFiles(absolute, out);
		} else if (entry.isFile()) {
			out.push(relativePath.split(sep).join("/"));
		}
	}
	return out;
}

// --- Minimal ZIP writer -----------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let value = i;
		for (let bit = 0; bit < 8; bit++) {
			value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
		}
		table[i] = value >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buffer.length; i++) {
		crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const file of files) {
		const nameBuffer = Buffer.from(file, "utf8");
		const content = readFileSync(join(ROOT, file));
		const crc = crc32(content);
		const compressed = deflateRawSync(content, { level: 9 });

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);          // version needed
		local.writeUInt16LE(0x0800, 6);      // UTF-8 flag
		local.writeUInt16LE(8, 8);           // deflate
		local.writeUInt16LE(0, 10);          // time
		local.writeUInt16LE(0, 12);          // date
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(content.length, 22);
		local.writeUInt16LE(nameBuffer.length, 26);
		local.writeUInt16LE(0, 28);
		localParts.push(local, nameBuffer, compressed);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);        // version made by
		central.writeUInt16LE(20, 6);        // version needed
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(content.length, 24);
		central.writeUInt16LE(nameBuffer.length, 28);
		central.writeUInt16LE(0, 30);        // extra length
		central.writeUInt16LE(0, 32);        // comment length
		central.writeUInt16LE(0, 34);        // disk number
		central.writeUInt16LE(0, 36);        // internal attributes
		central.writeUInt32LE(0, 38);        // external attributes
		central.writeUInt32LE(offset, 42);   // relative offset
		centralParts.push(central, nameBuffer);

		offset += local.length + nameBuffer.length + compressed.length;
	}

	const centralBuffer = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralBuffer.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, centralBuffer, end]);
}

// --- Main -------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const files = collectFiles(ROOT).sort();
const zip = buildZip(files);

mkdirSync(join(ROOT, "dist"), { recursive: true });
const output = join(ROOT, "dist", `user-agent-switcher-chrome-${manifest.version}.zip`);
writeFileSync(output, zip);

console.log(`Packaged ${files.length} files (${(zip.length / 1024 / 1024).toFixed(2)} MiB):`);
console.log(output);
