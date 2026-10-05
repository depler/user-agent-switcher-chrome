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

/**
 * Generation of `chrome.declarativeNetRequest` rules from the resolved
 * extension options.
 *
 * The Firefox version of this add-on intercepted `webRequest` in blocking
 * mode to rewrite the `User-Agent` request header. Manifest V3 removed
 * blocking `webRequest` for regular extensions, so we translate the very
 * same intent into declarativeNetRequest rules.
 *
 * Additionally, because a `MAIN` world content script cannot access any
 * extension API, the per-document navigator replacement data is smuggled
 * to the page through a `Server-Timing` response header that the
 * `content/navigator-override.js` script reads back synchronously from the
 * Performance Timeline at `document_start`.
 */

/* eslint-disable no-unused-vars */
const __background_dnr = (() => {
"use strict";


/** Name of the `Server-Timing` metric that carries the navigator data */
const METRIC_NAME = "uasw-config";

/** Rule ids for the global (catch-all) rules */
const GLOBAL_NET_ID = 1;
const GLOBAL_JS_ID  = 2;

/** First rule id used for the per-domain overrides */
const OVERRIDE_ID_BASE = 100;
/** Upper bound on the number of overrides that receive rules */
const MAX_OVERRIDES = 2000;

/** DNR priority; higher wins when several rules modify the same header */
const PRIORITY_GLOBAL   = 1;
const PRIORITY_OVERRIDE = 2;


/**
 * Serialize a navigator data-set into the `Server-Timing` header value that
 * `content/navigator-override.js` knows how to decode
 *
 * @param {object} dataset
 * @returns {string}
 */
function buildServerTimingValue(dataset) {
	// `encodeURIComponent` leaves no double-quotes, semicolons or backslashes
	// behind, which makes the value safe inside a quoted-string
	return `${METRIC_NAME};dur=0;desc="${encodeURIComponent(JSON.stringify(dataset))}"`;
}


/**
 * @param {string} userAgent
 * @returns {object} A DNR action that rewrites the request `User-Agent`
 */
function buildRequestAction(userAgent) {
	return {
		type: "modifyHeaders",
		requestHeaders: [
			{ header: "user-agent", operation: "set", value: userAgent }
		]
	};
}


/**
 * @param {string} userAgent
 * @param {object|undefined} dataset
 * @returns {object} A DNR action that rewrites the request `User-Agent` and
 *                   attaches the navigator data-set to the response
 */
function buildDocumentAction(userAgent, dataset) {
	return {
		type: "modifyHeaders",
		requestHeaders: [
			{ header: "user-agent", operation: "set", value: userAgent }
		],
		responseHeaders: dataset ? [
			{ header: "Server-Timing", operation: "set", value: buildServerTimingValue(dataset) }
		] : undefined
	};
}


/**
 * Normalize a hostname for use in the `requestDomains`/`initiatorDomains`
 * DNR conditions. These fields already match all sub-domains, so a leading
 * `*.` wildcard must be stripped.
 *
 * @param {string} hostname
 * @returns {string}
 */
function normalizeDomain(hostname) {
	return String(hostname || "")
		.trim()
		.toLowerCase()
		.replace(/^\*\./, "")
		.replace(/^\./, "")
		.replace(/\.$/, "");
}


/**
 * Build the complete set of dynamic DNR rules.
 *
 * @param {object} params
 * @param {string?} params.current            Currently selected global UA
 * @param {Iterable<{ pattern: { hostname: string }, content: { userAgent: string } }>} params.overrides Per-domain override data items
 * @param {Map<string, object>} params.parsedCache UA => navigator data-set
 * @param {string[]} params.resourceTypes    All DNR resource types
 * @param {string[]} params.documentTypes    Document resource types
 *
 * @returns {{ rules: object[], scope: { overrides: number } }}
 */
function buildRules(params) {
	const { current, overrides, parsedCache, resourceTypes, documentTypes } = params;
	const rules = [];

	// ---- Global (catch-all) rules ------------------------------------------
	if (typeof(current) === "string" && current.length > 0) {
		const dataset = parsedCache ? parsedCache.get(current) : null;

		rules.push({
			id: GLOBAL_NET_ID,
			priority: PRIORITY_GLOBAL,
			action: buildRequestAction(current),
			condition: { resourceTypes: resourceTypes }
		});

		if (dataset) {
			rules.push({
				id: GLOBAL_JS_ID,
				priority: PRIORITY_GLOBAL,
				action: {
					type: "modifyHeaders",
					responseHeaders: [
						{ header: "Server-Timing", operation: "set", value: buildServerTimingValue(dataset) }
					]
				},
				condition: { resourceTypes: documentTypes }
			});
		}
	}

	// ---- Per-domain override rules -----------------------------------------
	let nextId = OVERRIDE_ID_BASE;
	let count = 0;

	for (const item of overrides) {
		if (count >= MAX_OVERRIDES) {
			console.warn("[uasw] Too many per-domain overrides; further ones are ignored");
			break;
		}

		const userAgent = item && item.content ? item.content.userAgent : null;
		if (typeof(userAgent) !== "string" || userAgent.length < 1) {
			continue;
		}

		// NOTE: The old Firefox matcher distinguished "exact host" from
		//       "host + sub-domains". DNR's domain conditions always include
		//       sub-domains, so both collapse into the same behaviour here.
		const hostname = normalizeDomain(item.pattern ? item.pattern.hostname : "");
		if (!hostname) {
			continue;
		}

		const dataset = parsedCache ? parsedCache.get(userAgent) : undefined;

		// Requests initiated *by* a page on this domain (sub-resources)
		rules.push({
			id: nextId++,
			priority: PRIORITY_OVERRIDE,
			action: buildRequestAction(userAgent),
			condition: {
				initiatorDomains: [hostname],
				excludedResourceTypes: documentTypes
			}
		});

		// The document itself (main frame / sub frame)
		rules.push({
			id: nextId++,
			priority: PRIORITY_OVERRIDE,
			action: buildDocumentAction(userAgent, dataset),
			condition: {
				requestDomains: [hostname],
				resourceTypes: documentTypes
			}
		});

		count += 1;
	}

	return { rules: rules, scope: { overrides: count } };
}


/**
 * Decide whether the given User-Agent string claims to be a Chromium-based
 * browser. Used to decide whether the (Chrome-only) `navigator.userAgentData`
 * API should be hidden when spoofing a non-Chromium browser.
 *
 * @param {string} userAgent
 * @returns {boolean}
 */
function isChromiumUserAgent(userAgent) {
	return /Chrome\/|Chromium\/|CriOS\/|Edg[A-Z]?\//.test(userAgent);
}


return Object.freeze({
	buildRules:           buildRules,
	isChromiumUserAgent:  isChromiumUserAgent,
	METRIC_NAME:          METRIC_NAME,
});
})();
