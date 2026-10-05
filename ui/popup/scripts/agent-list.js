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


const __popup_agentlist = (() => {
"use strict";


/* eslint-disable no-undef */
const collapsible = __popup_collapsible;
/* eslint-enable no-undef */


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
 * @internal
 */
class CollapsibleElementExt extends collapsible.CollapsibleElement {
	/**
	 * @param {HTMLElement} element
	 * @param {String}      categoryName
	 * @param {((isVisible: Boolean) => any)?} onVisibilityChangeCB
	 */
	constructor(element, categoryName, onVisibilityChangeCB = null) {
		super(element, onVisibilityChangeCB);
		
		this.categoryName = categoryName;
	}
}


class AgentList {
	/**
	 * Append a newly created radio button and its label to the given `parent`
	 * element
	 * 
	 * @param {HTMLElement} DOMParent
	 * @param {String}  nameGroup   The radio button group to assign the element to
	 * @param {String}  labelText   The text to display next to the radio button (clickable)
	 * @param {String}  title       The tooltip text to show for the radio button
	 * @param {Boolean} selected    Should this radio button be checked by default?
	 * @param {Object}  dataEntries Strings to add to the element's dataSet
	 * 
	 * @returns {HTMLInputElement}
	 */
	static appendRadioToElement(DOMParent, nameGroup, labelText,
	                            title       = "",
	                            selected    = false,
	                            dataEntries = {})
	{
		let DOMContainer = document.createElement("div");
		DOMContainer.classList.add("panel-list-item", "browser-style");
		DOMContainer.title = title;
		
		// Create radio element according to specs
		let DOMRadio = document.createElement("input");
		DOMRadio.type = "radio";
		DOMRadio.name = nameGroup;
		DOMRadio.id   = uuidv4();
		
		DOMRadio.defaultChecked = selected;
		DOMRadio.checked        = selected;
		for(let name of Object.keys(dataEntries)) {
			DOMRadio.dataset[name] = dataEntries[name];
		}
		DOMContainer.appendChild(DOMRadio);
		
		// Create label according to specs
		let DOMLabel = document.createElement("label");
		DOMLabel.classList.add("text");
		DOMLabel.htmlFor     = DOMRadio.id;
		DOMLabel.textContent = labelText;
		DOMContainer.appendChild(DOMLabel);
		
		// Add the elements to the parent
		DOMParent.appendChild(DOMContainer);
		
		return DOMRadio;
	}
	
	
	
	/**
	 * @param {HTMLElement} DOMParent
	 * @param {popup.Categories}           categories
	 * @param {popup.agentlist.Callbacks}  callbacks
	 * @param {object}    initialOptions
	 * @param {string?}  [initialOptions.userAgent]
	 * @param {string[]} [initialOptions.collapsedCategories]
	 */
	constructor(DOMParent, categories, callbacks, initialOptions = {}) {
		/** @type {string[]} */
		let collapsedDefault = [];
		
		// Store parameters (including some breakdance for defaults)
		this._callbacks = callbacks;
		this._DOMParent = DOMParent;
		({ userAgent:           this._userAgent = null             } = initialOptions);
		({ collapsedCategories: this._collapsed = collapsedDefault } = initialOptions);
		
		/** @type {CollapsibleElementExt[]} */
		this._collapsibles = [];
		/** @type {HTMLInputElement[]} */
		this._DOMAgentRadios = [];
		this._notifyCBOnChange = true;
		
		// Generate static name label shared by all radio buttons of this group
		let radioNameGroup = uuidv4();
		
		// Add „Default“ radio button with label
		let defaultAgentLabel = browser.i18n.getMessage("popup_item_default");
		let DOMAgentDefaultRadio = AgentList.appendRadioToElement(
			DOMParent, radioNameGroup, defaultAgentLabel, defaultAgentLabel, true
		);
		this._DOMAgentRadios.push(DOMAgentDefaultRadio);
		
		DOMAgentDefaultRadio.addEventListener("change", () => {
			if(DOMAgentDefaultRadio.checked) {
				// Special "Default" item selected
				let oldUserAgent = this._userAgent;
				this._userAgent = null;
				
				if(this._notifyCBOnChange) {
					this._callbacks.onUserAgentChanged(this._userAgent, oldUserAgent);
				}
			}
		});
		
		// Add all categories and their items
		this._populateCategories(categories, radioNameGroup);
	}
	
	
	/**
	 * @param {popup.Categories} categories
	 * @param {String}           radioNameGroup
	 */
	_populateCategories(categories, radioNameGroup) {
		for(let [categoryName, [category, entries]] of categories) {
			// Add category header text block
			let DOMCategoryHeader = document.createElement("div");
			DOMCategoryHeader.classList.add("panel-section-header", "subsection", "collapsible");
			
			let DOMCategoryHeaderText = document.createElement("div");
			DOMCategoryHeaderText.classList.add("text-section-header");
			DOMCategoryHeaderText.textContent = category;
			DOMCategoryHeader.appendChild(DOMCategoryHeaderText);
			
			this._DOMParent.appendChild(DOMCategoryHeader);
			
			// Add User-Agent entries below the header
			let DOMCategoryBody = document.createElement("div");
			DOMCategoryBody.classList.add("panel-section", "panel-section-list", "collapsible-body");
			
			for(let { label, userAgent } of entries) {
				let itemIsSelected = (userAgent === this._userAgent);
				let itemEntries    = {"string": userAgent};
				let DOMAgentRadio = AgentList.appendRadioToElement(
					DOMCategoryBody, radioNameGroup, label, userAgent, itemIsSelected, itemEntries
				);
				this._DOMAgentRadios.push(DOMAgentRadio);
				
				DOMAgentRadio.addEventListener("change", () => {
					if(DOMAgentRadio.checked) {
						let userAgentPrev = this._userAgent;
						this._userAgent = userAgent;
						
						if(this._notifyCBOnChange) {
							this._callbacks.onUserAgentChanged(this._userAgent, userAgentPrev);
						}
					}
				});
			}
			
			this._DOMParent.appendChild(DOMCategoryBody);
			
			/** @type {CollapsibleElementExt} */
			let collapsibleElement = new CollapsibleElementExt(DOMCategoryBody, categoryName, (visible) => {
				if(visible) {
					// Change appearance of category header to “non-collapsed”
					// (arrow pointing down-wards)
					DOMCategoryHeader.classList.remove("collapsed");
					
					// Track this change in the internal list
					/** @type {string[]} */
					this._collapsed = this._collapsed.filter((item) => {
						return (item !== categoryName);
					});
				} else {
					// Change appearance of category header to “collapsed”
					// (arrow pointing in-wards)
					DOMCategoryHeader.classList.add("collapsed");
					
					// Track this change in the internal list
					if(!this._collapsed.includes(categoryName)) {
						this._collapsed.push(categoryName);
					}
				}
			});
			collapsibleElement.show(!this._collapsed.includes(categoryName));
			collapsibleElement.markReady();
			
			/* Add event handler for collapsing and uncollapsing sections */
			DOMCategoryHeader.addEventListener("click", () => {
				//WORKAROUND: Prevent scrollbar from appearing while uncollapsing element
				if(collapsibleElement.hidden) {
					if(document.documentElement.scrollHeight === document.documentElement.clientHeight) {
						document.documentElement.style.overflowY = "hidden";
						window.setTimeout(() => {
							document.documentElement.style.overflowY = null;
						}, 600);
					}
				}
				
				// Keep reference to old collapsed state for our callback
				let collapsedOld = Array.from(this._collapsed);
				
				// Toggle collapsed state
				// (will update `this._collapsed` in the visibily change callback)
				collapsibleElement.toggle();
				
				// Notify callback that the user changed the list of visible
				// categories
				this._callbacks.onCollapsedCategoriesChanged(this._collapsed, collapsedOld);
			});
			
			// Store references to elements for applying programatic updates
			// to the collapsible states later on
			this._collapsibles.push(collapsibleElement);
		}
	}
	
	
	
	/**
	 * @returns {String[]}
	 */
	get collapsedCategories() {
		return this._collapsed;
	}
	
	/**
	 * @param {String[]} collapsedCategories
	 */
	set collapsedCategories(collapsedCategories) {
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			// The internal `_collapsed` array state will be updated from the
			// `CollapsibleElement` change event handler
			for(let collapsible of this._collapsibles) {
				collapsible.show(!collapsedCategories.includes(collapsible.categoryName));
			}
		} finally {
			this._notifyCBOnChange = true;
		}
	}
	
	
	
	/**
	 * @returns {?String}
	 */
	get userAgent() {
		return this._userAgent;
	}
	
	/**
	 * @param {?String} userAgent
	 */
	set userAgent(userAgent) {
		// Prevent change events to the callbacks while we are updating our
		// internal state
		this._notifyCBOnChange = false;
		try {
			// The internal `_userAgent` value will be updated from the radio
			// button's change event handler
			for(let DOMAgentRadio of this._DOMAgentRadios) {
				// NOTE: Do not use `===` here as `undefined !== null`
				if(DOMAgentRadio.dataset["string"] == userAgent) {
					DOMAgentRadio.checked = true;
				}
				
				DOMAgentRadio.dispatchEvent(new Event("change"));
			}
		} finally {
			this._notifyCBOnChange = true;
		}
	}
}


return Object.freeze({
	AgentList: AgentList
});
})();