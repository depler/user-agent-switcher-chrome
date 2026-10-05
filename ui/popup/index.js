/*
 * User Agent Switcher
 * Copyright © 2017-2018  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


/* global popup, utils */
"use strict";


// Connect to background page and request it to suspend processing of option changes
// @ts-ignore: Incorrect error (we skipt the optional first argument here)
let port = browser.runtime.connect({name: "popup"});
port.postMessage({ request: "suspend-option-processing" });

// Resume option change processing when popup is backgrounded
document.addEventListener("visibilitychange", () => {
	if(document.hidden) {
		port.postMessage({ request: "resume-option-processing" });
	} else {
		port.postMessage({ request: "suspend-option-processing" });
	}
});


// Reload page if the list of available user-agents was updated
// (our entire UI is dynamically generated based on this information)
browser.storage.onChanged.addListener((changes, areaName) => {
	if(areaName !== "local") {
		return;
	}
	
	if(Object.keys(changes).includes("available")) {
		window.location.reload();
		return;
	}
});


/**
 * Find an element of type {@see T} in {@see document}, throwing if it
 * doesn't exist
 * 
 * @template T extends HTMLElement
 * @param {string} id The ID of the element to find
 * @param {new(...args: any[]) => T} type 
 * @throws {ReferenceError}
 * @returns {T}
 */
// @ts-ignore: TS-Bug: Default value is not correctly expanded
function safeGetElementById(id, type=HTMLElement) {
	let DOMElement = document.getElementById(id);
	if(DOMElement === null) {
		throw new ReferenceError(`Element #${id} is not defined`);
	} else if(!(DOMElement instanceof type)) {
		throw new ReferenceError(`Element #${id} is not of type ${type.name}`);
	} else {
		return DOMElement;
	}
}


// Parse query string parameters
/* eslint-disable indent */
/** @type {Map<string, string?>} */
const PARAMETERS = (function() {
	let params = new Map();
	
	for(let queryPart of window.location.hash.replace(/^#/, "").split("&")) {
		if(queryPart.includes("=")) {
			let [name, value] = queryPart.split("=", 2).map(decodeURIComponent);
			params.set(name, value);
		} else {
			params.set(decodeURIComponent(queryPart), null);
		}
	}
	
	return params;
})();
/* eslint-enable indent */



/**
 * @typedef OverrideData
 * @property {string?} userAgent
 */


/**
 * @param {utils.config.Options} options
 * @param {popup.Categories}     categories
 * @param {URL?}                 url
 * @param {utils.matchingengine.MatchingEngine} overrideMatcher
 * @param {utils.matchingengine.DataItem<OverrideData>?} overrideState
 */
function populateDocument(options, categories, url, overrideMatcher, overrideState) {
	/**
	 * Override document font-size to avoid the dynamic scaling-based font-size
	 * shrinking done by Firefox
	 *
	 * This is very useful on hi-res screens when tweaking
	 * layout.css.devPixelsPerPx (automatically or user-defined).
	 *
	 * (cf: 20190724033329.471f2255@be.back.L8R.net)
	 */
	if(options["override-popup-size"]) {
		document.body.style.fontSize = "16px";
	}
	
	
	/**
	 * "Open preferences" item
	 */
	safeGetElementById("panel-item-preferences").addEventListener("click", () => {
		// Browser action popup was opened as a separate tab
		//XXX: Is there any way to detect this from context!?
		if(PARAMETERS.has("tab")) {
			window.location.href = browser.runtime.getURL("ui/options/index.html");
		//COMPAT: Firefox for Android 56-
		} else if(typeof(browser.runtime.openOptionsPage) !== "undefined") {
			browser.runtime.openOptionsPage();
			window.close();
		} else {
			browser.tabs.create({
				active: true,
				url:    browser.runtime.getURL("ui/options/index.html"),
			}).then(window.close, console.exception);
		}
	});
	
	
	
	/**
	 * "Random User-Agent" mode configuration
	 */
	let randomMode = new popup.randommode.RandomMode(safeGetElementById("random-container"), categories, {
		onEnabledChanged: (enabled) => {
			//WORKAROUND: Prevent scrollbar from appearing while uncollapsing
			//            random-mode override menu
			if(enabled) {
				if(document.documentElement.scrollHeight === document.documentElement.clientHeight) {
					document.documentElement.style.overflowY = "hidden";
					window.setTimeout(() => {
						document.documentElement.style.overflowY = "";
					}, 600);
				}
			}
			
			browser.storage.local.set({
				"random-enabled": enabled,
			}).catch(console.exception);
		},
		
		onIntervalStateChanged: (intervalState) => {
			browser.storage.local.set({
				"random-interval": /** @type {any} */ (intervalState),
			}).catch(console.exception);
		},
		
		onSelectedCategoriesChanged: (selectedCategories) => {
			browser.storage.local.set({
				"random-categories": selectedCategories,
			}).catch(console.exception);
		}
	}, {
		enabled:            options["random-enabled"],
		selectedCategories: options["random-categories"],
		intervalState:      options["random-interval"],
	});
	
	
	
	/**
	 * Static User-Agent selector
	 */
	let agentList = new popup.agentlist.AgentList(safeGetElementById("agent-list"), categories, {
		onCollapsedCategoriesChanged: (collapsedCategories) => {
			browser.storage.local.set({
				"popup-collapsed": collapsedCategories
			}).catch(console.exception);
		},
		
		onUserAgentChanged: (userAgent) => {
			// Radio button with User-Agent selected
			browser.storage.local.set({
				"current": userAgent,
				
				// Disable random selection mode if manual selection has
				// been performed
				"random-enabled": false
			}).then(window.close, console.exception);
		}
	}, {
		userAgent:           options["current"],
		collapsedCategories: options["popup-collapsed"]
	});
	
	
	
	/**
	 * Per-page User-Agent override configuartion
	 */
	let overriableCollapsable = new popup.collapsible.CollapsibleElement(
		safeGetElementById("panel-section-overridable"), null, { toBottom: true }
	);
	let overrideMode = new popup.override.Override(safeGetElementById("override-container"), categories, url, {
		onEnabledChanged: (enabled) => {
			overriableCollapsable.show(!enabled);
			
			//WORKAROUND: Prevent scrollbar from appearing transitioning things
			//            around when chaning the override state
			if(document.documentElement.scrollHeight === document.documentElement.clientHeight) {
				document.documentElement.style.overflowY = "hidden";
				window.setTimeout(() => {
					document.documentElement.style.overflowY = "";
				}, 600);
			}
			
			// Add or remove override state data
			if(enabled && overrideMode.pattern) {
				/** @type {utils.matchingengine.DataItem<OverrideData>} */
				let state = {
					pattern: overrideMode.pattern,
					content: {
						userAgent: overrideMode.userAgent,
					}
				};
				
				overrideMatcher.putItem(state).then((state) => {
					overrideState = state;
				}, console.exception);
			} else if(overrideState) {
				overrideMatcher.removeItem(overrideState).then(() => {
					overrideState = null;
				}, console.exception);
			}
		},
		
		onPatternChanged: (pattern) => {
			if(!overrideState) {
				return;
			}
			
			overrideMatcher.moveItem(overrideState, pattern).then((state) => {
				overrideState = state;
			}, console.exception);
		},
		
		onUserAgentChanged: (userAgent) => {
			if(!overrideState) {
				return;
			}
			
			overrideState.content.userAgent = userAgent;
			overrideMatcher.putItem(overrideState).then(window.close, console.exception);
		},
		
		onCollapsedCategoriesChanged: (collapsedCategories) => {
			browser.storage.local.set({
				"popup-collapsed": collapsedCategories
			}).catch(console.exception);
		},
	}, {
		// Apply override state (default to global settings if no override is in effect)
		enabled:   !!overrideState,
		pattern:   overrideState ? overrideState.pattern           : null,
		userAgent: overrideState ? overrideState.content.userAgent : options["current"],
		
		// Share collapsed categories with main list
		collapsedCategories: options["popup-collapsed"]
	});
	overriableCollapsable.show(!overrideState);
	overriableCollapsable.markReady();
	
	
	
	/**
	 * Update page on configuration changes
	 */
	browser.storage.onChanged.addListener((changes, areaName) => {
		if(areaName !== "local") {
			return;
		}
		
		for(let name of Object.keys(changes)) {
			switch(name) {
				case "current":
					agentList.userAgent = changes[name].newValue;
					
					// Keep selected User-Agent in override mode in sync with
					// the global setting when override mode is not enabled
					if(!overrideState) {
						overrideMode.userAgent = changes[name].newValue;
					}
					break;
				
				case "random-enabled":
					randomMode.enabled = changes[name].newValue;
					break;
				
				case "random-categories":
					randomMode.selectedCategories = changes[name].newValue;
					break;
				
				case "random-interval":
					randomMode.intervalState = changes[name].newValue;
					break;
				
				case "popup-collapsed":
					agentList.collapsedCategories = changes[name].newValue;
					overrideMode.collapsedCategories = changes[name].newValue;
					break;
			}
		}
	});
	
	
	document.body.dataset["loadingstate"] = "done";
}


/**
 * @returns {Promise<void>}
 */
function waitForDocumentReady() {
	if(document.readyState === "complete") {
		return Promise.resolve();
	} else {
		return new Promise((resolve, _reject) => {
			window.addEventListener("DOMContentLoaded", () => {
				setTimeout(() => {
					resolve();
				}, 100);
			});
		});
	}
}


/**
 * @param {utils.config.types.All[]} entries
 * @returns {popup.Categories}
 */
function makeCategoryMap(entries) {
	let categoryEngText2locale = utils.config.TextEntryCategories.getEngText2Locale();
	
	/** @type {popup.Categories} */
	let categories = new Map();
	for(let entry of entries) {
		if(entry.type !== "user-agent" || !entry.enabled) {
			continue;
		}
		
		// Read the data for this category, creating a new data structure
		// if this is the first time we encounter an entry with this
		// category name
		let categoryData = categories.get(entry.category);
		if(typeof(categoryData) === "undefined") {
			// Localize default category names
			let categoryLocaleName = entry.category;
			if(categoryEngText2locale.hasOwnProperty(categoryLocaleName)) {
				categoryLocaleName = categoryEngText2locale[categoryLocaleName];
			}
			
			categoryData = [categoryLocaleName, []];
		}
		
		// Add the entry to the category and re-insert the data
		categoryData[1].push({
			label:     entry.label,
			userAgent: entry.string
		});
		categories.set(entry.category, categoryData);
	}
	
	return categories;
}


/**
 * @returns {Promise<[URL | null, utils.matchingengine.MatchingEngine, utils.matchingengine.DataItem<OverrideData> | null]>}
 */
async function queryOverrideData() {
	// Create instance for per-domain override matcher
	let overrideMatcher = new utils.matchingengine.MatchingEngine("override");
	
	// Try to obtain parsable page URL from somewhere
	/** @type {string | null | undefined} */
	let urlString = null;
	if(PARAMETERS.has("url")) {
		// Obtain page URL from query string
		urlString = PARAMETERS.get("url");
	} else {
		// Retrieve tab data to obtain the current tab URL
		let [tab] = await browser.tabs.query({
			currentWindow: true,
			active:        true
		});
		
		if(tab && tab.url) {
			urlString = tab.url;
		}
	}
	/** @type {URL | null} */
	let url = null;
	if(urlString) {
		try {
			url = new URL(urlString);
		} catch(e) {
			// Ignore unparsable tab URLs
		}
	}
	
	// Check if there is an override for the obtained URL
	/** @type {utils.matchingengine.DataItem<OverrideData> | null} */
	let overrideState = await overrideMatcher.findItem(url);
	
	return [url, overrideMatcher, overrideState];
}


/** @type {(keyof utils.config.Options)[]} */
const STORAGE_STARTUP_KEYS = [
	"available",
	
	"current",
	"popup-collapsed",
	
	"random-enabled",
	"random-categories",
	"random-interval",
	
	"override-popup-size"
];


/**
 * @returns {Promise<[utils.config.Options, popup.Categories]>}
 */
async function queryStorageData() {
	// Read configuration data
	let optionsRaw = await browser.storage.local.get(STORAGE_STARTUP_KEYS);
	
	/** @type {utils.config.Options} */
	// @ts-ignore
	let options = optionsRaw;
	
	// Convert the list of available User-Agent entries into a more usable form
	let categories = makeCategoryMap(options["available"]);
	
	return [options, categories];
}

Promise.all([
	// Parsed set of current options
	queryStorageData(),
	// Override data for current tab
	queryOverrideData(),
	// DOM availabilty
	waitForDocumentReady(),
]).then(([optionsData, overrideData]) => {
	// @ts-ignore: False positive – We do get a total of exactly 5 arguments
	return populateDocument(...optionsData, ...overrideData);
}).catch(console.exception);
