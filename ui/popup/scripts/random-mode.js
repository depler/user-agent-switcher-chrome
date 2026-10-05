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


const __popup_randommode = (() => {
/* global popup */
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


class RandomMode {
	/**
	 * @param {HTMLElement} DOMParent Base element from HTML template
	 * @param {popup.Categories}           categories
	 * @param {popup.randommode.Callbacks} callbacks
	 * @param {object}    initialOptions
	 * @param {boolean}  [initialOptions.enabled]
	 * @param {string[]} [initialOptions.selectedCategories]
	 * @param {utils.config.OptionsRandomInterval} [initialOptions.intervalState]
	 */
	constructor(DOMParent, categories, callbacks, initialOptions = {}) {
		/** @type {string[]} */
		const defCategories = [];
		/** @type {utils.config.OptionsRandomInterval} */
		const defInterval = {mode: "startup", value: 0, unit: "m"};
		
		// Store parameters (including some breakdance for defaults)
		this._callbacks = callbacks;
		this._DOMParent = DOMParent;
		({ enabled:            this._enabled    = false         } = initialOptions);
		({ selectedCategories: this._categories = defCategories } = initialOptions);
		({ intervalState:      this._interval   = defInterval   } = initialOptions);
		
		this._notifyCBOnChange = true;
		
		/* Initialize all sub-sections */
		
		// Random category selection
		this._DOMCategoryList = findElementByDataId(this._DOMParent, "category-list", HTMLElement);
		/** @type {HTMLInputElement[]} */
		this._DOMCategories   = [];
		this._initCategoriesSection(categories);
		
		// Random interval configuration
		this._DOMIntervalModeStartup = findElementByDataId(this._DOMParent, "interval-mode-startup", HTMLInputElement);
		this._DOMIntervalModeTimed   = findElementByDataId(this._DOMParent, "interval-mode-timed", HTMLInputElement);
		this._DOMIntervalTimeValue = findElementByDataId(this._DOMParent, "interval-time-value", HTMLInputElement);
		this._DOMIntervalTimeUnit  = findElementByDataId(this._DOMParent, "interval-time-unit", HTMLSelectElement);
		this._initIntervalSection();
		
		// Global random-mode toggle (do this last to ensure that the height of
		// the other elements will be final we initialising the collapsible)
		this._DOMEnabled = findElementByDataId(this._DOMParent, "enabled", HTMLInputElement);
		this._categoryCollapsable = new popup.collapsible.CollapsibleElement(this._DOMCategoryList);
		this._initEnabledSection();
	}
	
	_initEnabledSection() {
		// Set inital state
		this._DOMEnabled.checked = this._enabled;
		
		// Show or hide random configuration subsection based on state of
		// the global checkbox
		this._categoryCollapsable.show(this._enabled);
		this._categoryCollapsable.markReady();
		
		this._DOMEnabled.addEventListener("change", (_) => {
			this._enabled = this._DOMEnabled.checked;
			this._categoryCollapsable.show(this._enabled);
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onEnabledChanged(this._enabled, !this._enabled);
			}
		});
	}
	
	/**
	 * Initialize the random category configuration section
	 * 
	 * @param {popup.Categories} categories
	 */
	_initCategoriesSection(categories) {
		/**
		 * @param {Event} event
		 */
		let onCategoryChecked = (event) => {
			let DOMCategoryCheckbox = event.target;
			if(!(DOMCategoryCheckbox instanceof HTMLInputElement)) {
				return;
			}
			
			let categoryName = DOMCategoryCheckbox.dataset["name"];
			if(!categoryName) {
				return;
			}
			
			let categoriesOld = Array.from(this._categories);
			
			if(DOMCategoryCheckbox.checked) {
				// Track this change in the internal list
				if(!this._categories.includes(categoryName)) {
					this._categories.push(categoryName);
				}
			} else {
				// Track this change in the internal list
				/** @type {string[]} */
				this._categories = this._categories.filter((item) => {
					return (item !== categoryName);
				});
			}
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onSelectedCategoriesChanged(this._categories, categoriesOld);
			}
		};
		
		for(let [categoryName, [category, _]] of categories) {
			/*
			<div class="panel-list-item browser-style">
				<input type="checkbox" id="${uuid-${n}}" data-name="${categoryName}" />
				<label class="text" for="${uuid-${n}}">${category}</label>
			</div>
			*/
			
			let DOMCategoryItem = document.createElement("div");
			DOMCategoryItem.classList.add("panel-list-item", "browser-style");
			
			let DOMCategoryCheckbox = document.createElement("input");
			DOMCategoryCheckbox.type = "checkbox";
			DOMCategoryCheckbox.id   = uuidv4();
			DOMCategoryCheckbox.dataset["name"] = categoryName;
			DOMCategoryCheckbox.checked = this._categories.includes(categoryName);
			DOMCategoryItem.appendChild(DOMCategoryCheckbox);
			
			let DOMRandomCategoryLabel = document.createElement("label");
			DOMRandomCategoryLabel.classList.add("text");
			DOMRandomCategoryLabel.htmlFor     = DOMCategoryCheckbox.id;
			DOMRandomCategoryLabel.textContent = category;
			DOMCategoryItem.appendChild(DOMRandomCategoryLabel);
			
			this._DOMCategoryList.appendChild(DOMCategoryItem);
			this._DOMCategories.push(DOMCategoryCheckbox);
			
			DOMCategoryCheckbox.addEventListener("change", onCategoryChecked);
		}
	}
	
	/**
	 * Initialize the random interval configuration section
	 */
	_initIntervalSection() {
		/**
		 * @param {Event} event
		 */
		let onIntervalModeChange = (event) => {
			let DOMIntervalMode = event.target;
			if(!(DOMIntervalMode instanceof HTMLInputElement)
			|| !DOMIntervalMode.checked) {
				return;
			}
			
			let intervalOld = Object.assign({}, this._interval);
			
			// Apply value
			switch(DOMIntervalMode.dataset["id"]) {
				case "interval-mode-startup":
					this._interval.mode = "startup";
					break;
				
				case "interval-mode-timed":
					this._interval.mode = "timed";
					break;
			}
			
			// Only enable the time value and unit fields if their radio button is selected
			this._DOMIntervalTimeValue.disabled = (this._interval.mode !== "timed");
			this._DOMIntervalTimeUnit.disabled  = (this._interval.mode !== "timed");
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onIntervalStateChanged(this._interval, intervalOld);
			}
		};
		this._DOMIntervalModeStartup.addEventListener("change", onIntervalModeChange);
		this._DOMIntervalModeTimed.addEventListener("change", onIntervalModeChange);
		
		// Time unit selection
		this._DOMIntervalTimeUnit.addEventListener("change", (_) => {
			let intervalOld = Object.assign({}, this._interval);
			
			// @ts-ignore
			this._interval.unit = this._DOMIntervalTimeUnit.value;
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onIntervalStateChanged(this._interval, intervalOld);
			}
		});
		
		// Time value selection
		this._DOMIntervalTimeValue.addEventListener("change", (_) => {
			let intervalOld = Object.assign({}, this._interval);
			
			this._interval.value = parseInt(this._DOMIntervalTimeValue.value);
			
			// Notify callback
			if(this._notifyCBOnChange) {
				this._callbacks.onIntervalStateChanged(this._interval, intervalOld);
			}
		});
		
		// When selecting the interval-based random-mode timer, auto-focus the
		// time-value field
		this._DOMIntervalModeTimed.addEventListener("click", (_) => {
			this._DOMIntervalTimeValue.focus();
		});
		
		// Set initial state through the public setter
		this.intervalState = this._interval;
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
	 * @returns {string[]}
	 */
	get selectedCategories() {
		return Array.from(this._categories);
	}
	
	/**
	 * @param {string[]} selectedCategories
	 */
	set selectedCategories(selectedCategories) {
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			for(let DOMCategoryCheckbox of this._DOMCategories) {
				let categoryName = DOMCategoryCheckbox.dataset["name"];
				if(typeof(categoryName) !== "string") {
					continue;
				}
				
				DOMCategoryCheckbox.checked = selectedCategories.includes(categoryName);
				DOMCategoryCheckbox.dispatchEvent(new Event("change"));
			}
		} finally {
			this._notifyCBOnChange = true;
		}
	}
	
	
	/**
	 * @returns {utils.config.OptionsRandomInterval}
	 */
	get intervalState() {
		return Object.freeze(this._interval);
	}
	
	/**
	 * @param {utils.config.OptionsRandomInterval} intervalState
	 */
	set intervalState(intervalState) {
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			switch(intervalState.mode) {
				case "startup":
					this._DOMIntervalModeStartup.checked = true;
					break;
				case "timed":
					this._DOMIntervalModeTimed.checked = true;
					break;
			}
			
			this._DOMIntervalTimeValue.value = intervalState.value.toString();
			this._DOMIntervalTimeUnit.value  = intervalState.unit;
			
			// Notify event handlers of our action
			this._DOMIntervalModeStartup.dispatchEvent(new Event("change"));
			this._DOMIntervalModeTimed.dispatchEvent(new Event("change"));
			this._DOMIntervalTimeValue.dispatchEvent(new Event("change"));
			this._DOMIntervalTimeUnit.dispatchEvent(new Event("change"));
		} finally {
			this._notifyCBOnChange = true;
		}
	}
}


return Object.freeze({
	RandomMode: RandomMode
});
})();