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
 * MAIN world navigator spoofing.
 *
 * This script is registered (dynamically, from the service worker) as a
 * `world: "MAIN"`, `runAt: "document_start"` content script. Running in the
 * main world is required to hide the replacement from page scripts, but it
 * also means that no extension API (`chrome.storage`, …) is available.
 *
 * The navigator data-set is therefore carried inside a `Server-Timing`
 * response header that the service worker attaches through
 * `declarativeNetRequest` (see `background/dnr.js`). It is read back
 * synchronously from the Performance Timeline before any page script runs.
 */

(function() {
"use strict";

/** Must match `METRIC_NAME` in `background/dnr.js` */
const METRIC_NAME = "uasw-config";

/** Navigator properties that Chrome actually exposes and that we override */
const PROPERTY_NAMES = ["userAgent", "appVersion", "platform", "product", "productSub", "vendor", "vendorSub"];


/**
 * Extract the navigator data-set from the Performance Timeline, if present
 *
 * @returns {{ [name: string]: any } | null}
 */
function readConfig() {
	let entries;
	try {
		entries = performance.getEntriesByType("navigation");
	} catch(_) {
		return null;
	}

	for (const entry of entries) {
		const serverTiming = /** @type {PerformanceResourceTiming} */ (entry).serverTiming;
		if (!serverTiming) {
			continue;
		}

		for (const timing of serverTiming) {
			if (timing.name === METRIC_NAME && timing.description) {
				try {
					return JSON.parse(decodeURIComponent(timing.description));
				} catch(_) { /* malformed – ignore */ }
			}
		}
	}

	return null;
}


/**
 * Hide our `Server-Timing` marker from the page after we have read it.
 *
 * Without this, any script could detect the extension by inspecting the
 * navigation/stored resource timing entries.
 */
function hideMarker() {
	const CTORS = [PerformanceNavigationTiming, PerformanceResourceTiming];
	const seen = new Set();

	for (const ctor of CTORS) {
		if (typeof(ctor) !== "function" || seen.has(ctor.prototype)) {
			continue;
		}
		seen.add(ctor.prototype);

		const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, "serverTiming");
		if (!descriptor || typeof(descriptor.get) !== "function") {
			continue;
		}

		const originalGetter = descriptor.get;
		const filteredCache = new WeakMap();

		try {
			Object.defineProperty(ctor.prototype, "serverTiming", {
				get: function() {
					let filtered = filteredCache.get(this);
					if (filtered === undefined) {
						let entries;
						try {
							entries = originalGetter.call(this) || [];
						} catch(_) {
							entries = [];
						}
						filtered = Object.freeze(Array.prototype.filter.call(entries, (entry) => {
							return entry.name !== METRIC_NAME;
						}));
						filteredCache.set(this, filtered);
					}
					return filtered;
				},
				configurable: true,
				enumerable:   descriptor.enumerable
			});
		} catch(_) { /* prototype is locked down – ignore */ }
	}
}


/**
 * Build an accessor function that mimics a native getter as closely as the
 * platform allows
 *
 * @param {string} name
 * @param {*}      value
 * @returns {() => *}
 */
function makeGetter(name, value) {
	const getter = function() {
		return value;
	};

	try {
		Object.defineProperty(getter, "name", {
			value:        `get ${name}`,
			configurable: true
		});
	} catch(_) { /* ignored */ }

	try {
		getter.toString = () => `function get ${name}() { [native code] }`;
	} catch(_) { /* ignored */ }

	return getter;
}


/**
 * Define a value accessor on `target`, falling back to a plain property
 *
 * @param {object} target
 * @param {string} name
 * @param {*}      value
 * @returns {boolean}
 */
function defineAccessor(target, name, value) {
	try {
		Object.defineProperty(target, name, {
			get:          makeGetter(name, value),
			configurable: true,
			enumerable:   true
		});
		return true;
	} catch(_) {
		return false;
	}
}


/**
 * Replace the requested `navigator.*` properties with the given data-set
 *
 * @param {{ [name: string]: any }} dataSet
 */
function overrideNavigatorData(dataSet) {
	const navigatorPrototype = Object.getPrototypeOf(navigator);

	for (const name of PROPERTY_NAMES) {
		const value = dataSet[name];
		if (typeof(value) !== "string") {
			continue;
		}

		// Define on the prototype (like the real browser does) so that the
		// value cannot be read back through the original descriptor
		if (!defineAccessor(navigatorPrototype, name, value)) {
			defineAccessor(navigator, name, value);
		}
	}

	// `navigator.userAgentData` only exists in Chromium-based browsers.
	// Hide it when we are pretending to be a non-Chromium browser so that the
	// two do not contradict each other.
	if (dataSet.chromium === false) {
		const hide = function() {
			return undefined;
		};
		if (!defineAccessor(navigatorPrototype, "userAgentData", undefined)) {
			try {
				Object.defineProperty(navigatorPrototype, "userAgentData", {
					get: hide, configurable: true
				});
			} catch(_) {
				try {
					Object.defineProperty(navigator, "userAgentData", {
						get: hide, configurable: true
					});
				} catch(_) { /* ignored */ }
			}
		}
	}
}


// Only patch each document once
if (typeof(window.pageHasOverride) === "undefined" || !window.pageHasOverride) {
	const dataSet = readConfig();

	if (dataSet && typeof(dataSet.userAgent) === "string") {
		window.pageHasOverride = true;
		try {
			overrideNavigatorData(dataSet);
		} catch(error) {
			console.error("[User-Agent Switcher] navigator override failed:", error);
		}
		hideMarker();
	}
}

})();
