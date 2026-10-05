/*
 * User Agent Switcher
 * Copyright © 2018  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


const __popup_override = (() => {
/* global popup, utils, psl */
"use strict";


/**
 * Generate an version 4 UUID
 * 
 * @internal
 * @see https://stackoverflow.com/a/2117523
 * @returns {String}
 */
function uuidv4() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}


/**
 * Find an element with pattern {@see selector} and with type {@see T} inside
 * {@see element}, throwing if it doesn't exist
 * 
 * @template T
 * @param {NodeSelector} DOMParent The element to search within
 * @param {string}       id        The value of the `data-id` property to look for
 * @param {new(...args: any[]) => T} type
 * @returns {T}
 */
function findElementByDataId(DOMParent, id, type) {
	for(let DOMElement of DOMParent.querySelectorAll(`*[data-id='${id}']`)) {
		if(DOMElement instanceof type) {
			return DOMElement;
		}
	}
	
	console.error(`Failed to find element with \`data-id\` "${id}" within parent`, DOMParent);
	throw new ReferenceError(`Element with \`data-id\` "${id}" of type ${type.name} is undefined`);
}


/**
 * List of protocol schemes (with the trailing colon) to show the override
 * control for
 * 
 * @type {string[]}
 */
const PROTOCOL_WHITELIST = ["http:", "https:", "ftp:"];


/**
 * Per-page override selector
 */
class Override {
	/**
	 * @param {HTMLElement} DOMParent Base element from HTML template
	 * @param {URL?}        pageUrl
	 * @param {popup.Categories}         categories
	 * @param {popup.override.Callbacks} callbacks
	 * @param {object}    initialOptions
	 * @param {boolean}  [initialOptions.enabled]
	 * @param {utils.matchingengine.MatchingPattern?} [initialOptions.pattern]
	 * @param {string?}  [initialOptions.userAgent]
	 * @param {string[]} [initialOptions.collapsedCategories]
	 */
	constructor(DOMParent, categories, pageUrl, callbacks, initialOptions = {}) {
		this._DOMParent = DOMParent;
		this._callbacks = callbacks;
		
		({ enabled: this._enabled = false } = initialOptions);
		({ pattern: this._pattern = null  } = initialOptions);
		
		this._notifyCBOnChange = true;
		
		this._DOMEnabled    = findElementByDataId(DOMParent, "enabled",     HTMLInputElement);
		this._DOMBody       = findElementByDataId(DOMParent, "body",        HTMLElement);
		this._DOMDomainList = findElementByDataId(DOMParent, "domain-list", HTMLElement);
		this._DOMAgentList  = findElementByDataId(DOMParent, "agent-list",  HTMLElement);
		/** @type {Map<HTMLInputElement, utils.matchingengine.MatchingPattern>} */
		this._DOMDomains = new Map();
		
		this._bodyCollapsiable = new popup.collapsible.CollapsibleElement(this._DOMBody);
		
		// Reuse agent list component for the rendering the actual list of
		// possible User-Agents
		this._agentList = new popup.agentlist.AgentList(
			this._DOMAgentList, categories, this._callbacks, initialOptions
		);
		
		// Do not continue if the page URL does not use a supported/tested
		// protocol scheme
		if(!pageUrl || !PROTOCOL_WHITELIST.includes(pageUrl.protocol)) {
			// Hide override selector and skip initializing most functionality
			DOMParent.style.display = "none";
			return;
		}
		
		this._initDomainSection(pageUrl);
		this._initEnabledSection();
	}
	
	_initEnabledSection() {
		// Set inital state
		this._DOMEnabled.checked = this._enabled;
		
		// Show or hide random configuration subsection based on state of
		// the global checkbox
		this._bodyCollapsiable.show(this._enabled);
		this._bodyCollapsiable.markReady();
		
		this._DOMEnabled.addEventListener("change", (_) => {
			this._enabled = this._DOMEnabled.checked;
			this._bodyCollapsiable.show(this._enabled);
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onEnabledChanged(this._enabled, !this._enabled);
			}
		});
	}
	
	/**
	 * @param {URL} pageUrl
	 */
	_initDomainSection(pageUrl) {
		let onOverrideDomainChange = ((/** @type {Event} */ event) => {
			let DOMDomainRadio = event.target;
			if(!(DOMDomainRadio instanceof HTMLInputElement)) {
				return;
			}
			
			let pattern = this._DOMDomains.get(DOMDomainRadio);
			if(!pattern) {
				return;
			}
			
			let patternOld = this._pattern ? this._pattern.clone() : null;
			
			this._pattern = pattern;
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onPatternChanged(this._pattern, patternOld);
			}
		});
		
		// Build list of patterns that match the current domain
		let patterns = [
			// Exact hostname only (exact)
			new utils.matchingengine.MatchingPattern(pageUrl),
		];
		if(!patterns[0].isHostnameIPAddress) {
			// Hostname and all subdomains (suffix)
			let patternsSuffix = patterns[0].clone();
			patternsSuffix.isWildcard = true;
			patterns.splice(0, 0, patternsSuffix);
			
			// Base domain / second-level domain name and all subdomains (base)
			let urlHostnameBase = psl.get(pageUrl.hostname);
			if(urlHostnameBase && urlHostnameBase !== pageUrl.hostname) {
				let patternsBase = patternsSuffix.clone();
				patternsBase.hostname = urlHostnameBase;
				patterns.push(patternsBase);
			}
		}
		
		// Default to first generated pattern if none was given
		if(!this._pattern) {
			this._pattern = patterns[0];
		}
		
		// Add additional pattern for provided domain value if none of the
		// generated patterns match it
		let defaultDomainMatched = 0;
		for(let pattern of patterns) {
			defaultDomainMatched |= this._pattern.equals(pattern) ? 1 : 0;
		}
		if(!defaultDomainMatched) {
			patterns.splice(0, 0, this._pattern);
		}
		
		// Generate static name label shared by all radio buttons of this group
		let radioNameGroup = uuidv4();
		
		// Load and parse domain name selection message catalog entry
		let [domainMsgBefore, domainMsgAfter] =
			browser.i18n.getMessage("popup_item_override_tpl", "$HOSTNAME$")
			            .split("$HOSTNAME$");
		
		for(let pattern of patterns) {
			/*
			<div class="panel-list-item browser-style">
				<input type="radio" name="${radioNameGroup}" id="${uuid-${n}}" />
				<label for="${uuid-${n}}" class="text">
					${domainMsgBefore}<em>${pattern.toString()}</em>${domainMsgAfter}
				</label>
			</div>
			*/
			
			let DOMDomainContainer = document.createElement("div");
			DOMDomainContainer.classList.add("panel-list-item", "browser-style");
			
			let DOMDomainRadio = document.createElement("input");
			DOMDomainRadio.type = "radio";
			DOMDomainRadio.name = radioNameGroup;
			DOMDomainRadio.id   = uuidv4();
			DOMDomainRadio.checked = this._pattern.equals(pattern);
			DOMDomainContainer.appendChild(DOMDomainRadio);
			
			let DOMOverrideLabelContent = document.createElement("em");
			DOMOverrideLabelContent.appendChild(document.createTextNode(pattern.toString()));
			
			let DOMDomainLabel = document.createElement("label");
			DOMDomainLabel.classList.add("text");
			DOMDomainLabel.htmlFor = DOMDomainRadio.id;
			DOMDomainLabel.appendChild(document.createTextNode(domainMsgBefore));
			DOMDomainLabel.appendChild(DOMOverrideLabelContent);
			DOMDomainLabel.appendChild(document.createTextNode(domainMsgAfter));
			DOMDomainContainer.appendChild(DOMDomainLabel);
			
			this._DOMDomainList.appendChild(DOMDomainContainer);
			this._DOMDomains.set(DOMDomainRadio, pattern);
			
			DOMDomainRadio.addEventListener("change", onOverrideDomainChange);
		}
	}
	
	
	/**
	 * @returns {boolean}
	 */
	get enabled() {
		return this._enabled;
	}
	
	/**
	 * @param {boolean} enabled
	 */
	set enabled(enabled) {
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			this._DOMEnabled.checked = enabled;
			this._DOMEnabled.dispatchEvent(new Event("change"));
		} finally {
			this._notifyCBOnChange = true;
		}
	}
	
	
	/**
	 * @returns {utils.matchingengine.MatchingPattern?}
	 */
	get pattern() {
		return this._pattern ? this._pattern.clone() : null;
	}
	
	/**
	 * @param {utils.matchingengine.MatchingPattern?} pattern
	 */
	set pattern(pattern) {
		if(!pattern) {
			for(let defaultPattern of this._DOMDomains.values()) {
				pattern = defaultPattern;
				break;
			}
			
			if(!pattern) {
				return;
			}
		}
		
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			for(let [DOMDomainRadio, pattern2] of this._DOMDomains) {
				DOMDomainRadio.checked = pattern.equals(pattern2);
				DOMDomainRadio.dispatchEvent(new Event("change"));
			}
		} finally {
			this._notifyCBOnChange = true;
		}
	}
	
	
	/**
	 * @returns {string[]}
	 */
	get collapsedCategories() {
		return this._agentList.collapsedCategories;
	}
	
	/**
	 * @param {string[]} collapsedCategories
	 */
	set collapsedCategories(collapsedCategories) {
		this._agentList.collapsedCategories = collapsedCategories;
	}
	
	
	/**
	 * @returns {string?}
	 */
	get userAgent() {
		return this._agentList.userAgent;
	}
	
	/**
	 * @param {string?} userAgent
	 */
	set userAgent(userAgent) {
		this._agentList.userAgent = userAgent;
	}
}

return Object.freeze({
	Override: Override
});
})();