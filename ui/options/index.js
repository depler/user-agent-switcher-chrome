/*
 * User Agent Switcher
 * Copyright © 2017  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global utils */
"use strict";


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


/**
 * Find an element with pattern {@see selector} and with type {@see T} inside
 * {@see element}, throwing if it doesn't exist
 * 
 * @template T
 * @param {NodeSelector} element  The element to query
 * @param {string}       selector The CSS selector matching pattern
 * @param {new(...args: any[]) => T} type
 * @returns {T}
 */
// @ts-ignore: TS-Bug: Default value is not correctly expanded
function safeQuerySelector(element, selector, type=HTMLElement) {
	for(let DOMElement of element.querySelectorAll(selector)) {
		if(DOMElement instanceof type) {
			return DOMElement;
		}
	}
	
	throw new ReferenceError(`Element ${selector} of type ${type.name} is undefined`);
}


class DOMEntriesBase {
	/**
	 * @param {string} id
	 */
	constructor(id) {
		this._DOMContainer = safeGetElementById(id, HTMLElement);
	}
	
	/**
	 * @param {boolean} visible
	 */
	setVisible(visible) {
		this._DOMContainer.dataset["visible"] = Boolean.prototype.toString.call(visible);
	}
}


/** @type {utils.config.types.UserAgent} */
const ENTRIES_PROTOTYPE = {
	"type":     "user-agent",
	"enabled":  true,
	"label":    "",
	"category": "",
	"string":   ""
};

/** @type {(keyof utils.config.types.UserAgent)[]} */
const ENTRIES_COLUMN_NAMES = ["enabled", "label", "category", "string"];

/** @type {(keyof utils.config.types.UserAgent)[]} */
const ENTRIES_COLUMN_BOOLEAN = ["enabled"];

class DOMEntriesTable extends DOMEntriesBase {
	/**
	 * @param {utils.config.StorageArray<utils.config.types.All>} entries
	 */
	constructor(entries) {
		super("entries-view-table");
		this._entries = entries;
		
		this._DOMTable        = safeQuerySelector(this._DOMContainer, "table > tbody", HTMLTableSectionElement);
		this._DOMCategoryList = safeQuerySelector(this._DOMContainer, "datalist",      HTMLDataListElement);
		
		// Mappings for generic category labels to locale labels and vice versa
		this._categoryEngText2locale = utils.config.TextEntryCategories.getEngText2Locale();
		this._categoryLocale2engText = utils.config.TextEntryCategories.getLocale2EngText();
		
		// Generate new ID for category list
		this._DOMCategoryList.id = `entries-view-table-categories_${(new Date()).getTime()}`;
	}
	
	/**
	 * Replace all currently displayed rows with a new batch generated from the current
	 * state of the stored `entries` object
	 */
	refresh() {
		// Remove all existing table rows
		while(this._DOMTable.lastChild) {
			this._DOMTable.removeChild(this._DOMTable.lastChild);
		}
		
		// Add table row for each item current part of the configuration
		for(let index = 0; index < this._entries.length; index++) {
			this.addBoundRow(index);
		}
		
		// Add special table row for a yet-to-be-created item
		this.addUnboundRow();
		
		// Create list of category auto-completion values
		this.populateCategoryList();
	}
	
	/**
	 * Render a new row for the given `rowIndex` in `entries`
	 *
	 * @param {number} rowIndex
	 * @returns {HTMLTableRowElement?} The newly created row element
	 */
	addBoundRow(rowIndex) {
		if(this._entries[rowIndex].type !== "user-agent") {
			return null;
		}
		
		let DOMRow = document.createElement("tr");
		DOMRow.dataset["state"] = "bound";
		DOMRow.dataset["index"] = rowIndex.toString();
		
		for(let columnName of ENTRIES_COLUMN_NAMES) {
			this.addRowColumnField(DOMRow, columnName);
		}
		this.addRowColumnRemove(DOMRow);
		
		this._DOMTable.appendChild(DOMRow);
		return DOMRow;
	}
	
	/**
	 * Render a new row that can be used to add another row to `entries`
	 *
	 * @returns {HTMLTableRowElement} The newly created row element
	 */
	addUnboundRow() {
		let DOMRow = document.createElement("tr");
		DOMRow.dataset["state"] = "unbound";
		
		for(let columnName of ENTRIES_COLUMN_NAMES) {
			this.addRowColumnField(DOMRow, columnName);
		}
		
		this._DOMTable.appendChild(DOMRow);
		return DOMRow;
	}
	
	/**
	 * Recreate the data-list of proposed category values
	 */
	populateCategoryList() {
		// Clear current category option list
		while(this._DOMCategoryList.firstChild) {
			this._DOMCategoryList.removeChild(this._DOMCategoryList.firstChild);
		}
		
		// Generate list of all used and default categories
		/** @type {Set<string>} */
		let categoryNames = new Set();
		for(let categoryName of Object.keys(this._categoryLocale2engText)) {
			categoryNames.add(categoryName);
		}
		for(let entry of this._entries) {
			if(entry.type !== "user-agent") {
				continue;
			}
			
			// Get entry category text localized to current language
			// (custom descriptions will be unaffected by this transformation)
			let category = entry.category;
			if(this._categoryEngText2locale.hasOwnProperty(category)) {
				category = this._categoryEngText2locale[category];
			}
			
			categoryNames.add(category);
		}
		let categoryNameArray = [...categoryNames];
		categoryNameArray.sort();
		
		// Add the a new option for each applicable category
		for(let categoryName of categoryNameArray) {
			let DOMCategoryOption = document.createElement("option");
			DOMCategoryOption.value = categoryName;
			this._DOMCategoryList.appendChild(DOMCategoryOption);
		}
	}
	
	/**
	 * Add a currently unbound row to `entries` and add all remaining UI elements that set
	 * such a row apart from a bound row – thereby making it a bound row
	 *
	 * @param {HTMLTableRowElement} DOMRow
	 * @returns {Number} Index of the newly created row
	 */
	upgradeUnboundRow(DOMRow) {
		let row = Object.assign({}, ENTRIES_PROTOTYPE);
		let rowIndex = (this._entries.push(row) - 1);
		
		// Add remove button and index attribute to row
		DOMRow.dataset["index"] = rowIndex.toString();
		this.addRowColumnRemove(DOMRow);
		
		// Declare row to be bound to an entry of the extension options now
		DOMRow.dataset["state"] = "bound";
		
		return rowIndex;
	}
	
	/**
	 * Add column for textual data field to a row
	 *
	 * @param {HTMLTableRowElement} DOMRow
	 * @param {keyof utils.config.types.UserAgent} columnName
	 * @returns {HTMLInputElement} The created text input field
	 */
	addRowColumnField(DOMRow, columnName) {
		let rowIndex  = -1;
		let dataIndex = DOMRow.dataset["index"];
		if(DOMRow.dataset["state"] !== "unbound" && dataIndex) {
			rowIndex = parseInt(dataIndex);
		}
		
		let DOMFieldCol = document.createElement("td");
		let DOMFieldItm;
		if(rowIndex >= 0) {
			let entry = this._entries[rowIndex];
			if(entry.type !== "user-agent") {
				throw new Error("AssertionError: Row element index must refer to User-Agent entry");
			}
			let entryValue = entry[columnName];
			if(typeof(entryValue) === "boolean") {
				DOMFieldItm = document.createElement("input");
				DOMFieldItm.type    = "checkbox";
				DOMFieldItm.checked = entryValue;
			} else {
				DOMFieldItm = document.createElement("input");
				DOMFieldItm.type  = "text";
				DOMFieldItm.value = entryValue;
			}
		} else {
			if(ENTRIES_COLUMN_BOOLEAN.includes(columnName)) {
				DOMFieldItm = document.createElement("input");
				DOMFieldItm.type    = "checkbox";
				DOMFieldItm.checked = true;
			} else {
				DOMFieldItm = document.createElement("input");
				DOMFieldItm.type  = "text";
				DOMFieldItm.value = "";
			}
		}
		
		// Special handling of the category column
		if(columnName === "category") {
			// Associate the category data list with fields of the category column
			DOMFieldItm.setAttribute("list", this._DOMCategoryList.id);
			
			// Translate default category names
			if(this._categoryEngText2locale.hasOwnProperty(DOMFieldItm.value)) {
				DOMFieldItm.value = this._categoryEngText2locale[DOMFieldItm.value];
			}
		}
		
		DOMFieldCol.appendChild(DOMFieldItm);
		DOMRow.appendChild(DOMFieldCol);
		
		DOMFieldItm.addEventListener("change", (event) => {
			/** @type {HTMLInputElement} */
			// @ts-ignore
			let DOMFieldItm = event.target;
			
			/** @type {HTMLTableRowElement} */
			// @ts-ignore
			let DOMRow = DOMFieldItm.parentNode.parentNode;
			
			// Upgrade row if it is currently not bound to an entry in `entries`
			let rowIndex;
			let dataIndex = DOMRow.dataset["index"];
			if(DOMRow.dataset["state"] === "unbound" || !dataIndex) {
				rowIndex = this.upgradeUnboundRow(DOMRow);
				
				// Add a new unbound row to table (so that users can create more rows)
				this.addUnboundRow();
			} else {
				rowIndex = parseInt(dataIndex);
			}
			
			let entry = this._entries[rowIndex];
			if(entry.type !== "user-agent") {
				throw new Error("AssertionError: Row element index must refer to User-Agent entry");
			}
			
			// Set new value
			if(DOMFieldItm.type == "checkbox") {
				/** @type {any} */ (entry)[columnName] = DOMFieldItm.checked;
			} else {
				let value = DOMFieldItm.value;
				if(columnName === "category" && this._categoryLocale2engText.hasOwnProperty(value)) {
					// Translate default category names back to english before saving
					value = this._categoryLocale2engText[value];
				}
				/** @type {any} */ (entry)[columnName] = value;
			}
			
			// Save changes
			this._entries.store().then(() => {
				if(this._entries.changed) {
					document.body.setAttribute("data-entries-changed", "true");
				}
				
				// Recreate list of category auto-completion values
				this.populateCategoryList();
			}, console.exception);
		});
		
		return DOMFieldItm;
	}
	
	/**
	 * Add column for removing the row and its data
	 *
	 * @param {HTMLTableRowElement} DOMRow
	 * @returns {HTMLButtonElement} The created button
	 */
	addRowColumnRemove(DOMRow) {
		let DOMRemoveCol = document.createElement("td");
		let DOMRemoveItm = document.createElement("button");
		DOMRemoveItm.textContent = "➖";
		DOMRemoveItm.title       = "Remove Item";
		DOMRemoveCol.appendChild(DOMRemoveItm);
		DOMRow.appendChild(DOMRemoveCol);
		
		DOMRemoveItm.addEventListener("click", (event) => {
			/** @type {HTMLTableRowElement} */
			// @ts-ignore
			let DOMRow = event.target.parentNode.parentNode;
			
			let dataIndex = DOMRow.dataset["index"];
			if(!dataIndex) {
				return;
			}
			
			// Remove entry row from storage
			let idx = parseInt(dataIndex);
			this._entries.splice(idx, 1);
			this._entries.store().then(() => {
				let DOMRowSibling = DOMRow.nextElementSibling;
				
				// Remove the entry's row from the table
				// @ts-ignore
				DOMRow.parentNode.removeChild(DOMRow);
				
				// Update the indices of all following entry rows in the table
				while(DOMRowSibling !== null) {
					if(!(DOMRowSibling instanceof HTMLElement)) {
						DOMRowSibling = DOMRowSibling.nextElementSibling;
						continue;
					}
					
					let dataIndex = DOMRowSibling.dataset["index"];
					if(!dataIndex) {
						DOMRowSibling = DOMRowSibling.nextElementSibling;
						continue;
					}
					
					let idx = parseInt(dataIndex);
					if(!isNaN(idx)) {
						DOMRowSibling.dataset["index"] = (idx - 1).toString();
					}
					
					DOMRowSibling = DOMRowSibling.nextElementSibling;
				}
				
				if(this._entries.changed) {
					document.body.setAttribute("data-entries-changed", "true");
				}
				
				// Recreate list of category auto-completion values
				this.populateCategoryList();
			}, console.exception);
		});
		
		return DOMRemoveItm;
	}
}


class DOMEntriesText extends DOMEntriesBase {
	/**
	 * 
	 * @param {utils.config.StorageArray<utils.config.types.All>} entries 
	 */
	constructor(entries) {
		super("entries-view-text");
		this._parser = new utils.config.TextEntryParser(entries);
		
		this._DOMTextarea = safeQuerySelector(this._DOMContainer, "textarea", HTMLTextAreaElement);
		this._DOMTextarea.addEventListener("change", async (_) => {
			await this._parser.parse(this._DOMTextarea.value);
			// @ts-ignore: Would be easy to fix if we could make stuff generic
			//             over `T extends …` from JSDoc
			await this._parser.entries.store();
			// @ts-ignore: See above
			if(this._parser.entries.changed) {
				document.body.setAttribute("data-entries-changed", "true");
			}
		});
	}
	
	
	refresh() {
		this._DOMTextarea.value = this._parser.serialize();
	}
}



/**
 * Display and implement an interactive popup that confirms that all entries
 * have been reset and offers to undo this action
 * 
 * @param {() => void} refreshView
 * @param {utils.config.StorageArray<utils.config.types.All>} entries
 * @param {utils.config.types.All[]} previousEntries
 */
function displayResetUndoPopup(refreshView, entries, previousEntries) {
	let DOMResetUndoPopup = safeGetElementById("reset-undo-popup", HTMLElement);
	DOMResetUndoPopup.style.visibility = "visible";
	DOMResetUndoPopup.style.opacity    = "1";
	
	
	let DOMResetUndoButton = safeQuerySelector(DOMResetUndoPopup, "button", HTMLButtonElement);
	
	let resetUndoHandler = (() => {
		// Reset state of entries list
		entries.splice(0, entries.length);
		Array.prototype.push.apply(entries, previousEntries);
		
		// Remove all event listeners
		DOMResetUndoButton.removeEventListener("click", resetUndoHandler);
		document.body.removeEventListener("click", bodyClickHandler);
		
		// Save changes (should automatically mark entries as changed again)
		entries.store().then(() => {
			refreshView();
			
			// Fade-out popup
			DOMResetUndoPopup.style.opacity = "0";
			window.setTimeout(() => {
				DOMResetUndoPopup.style.visibility = "hidden";
			}, 500);
		});
	});
	
	let bodyClickHandler = ((/** @type {MouseEvent} */ event) => {
		// Don't do anything if click was somewhere within our popup
		/** @type {EventTarget?} */
		let DOMNode = event.target;
		for(; DOMNode instanceof HTMLElement; DOMNode = DOMNode.parentNode) {
			if(DOMNode === DOMResetUndoPopup) {
				return;
			}
		}
		
		// Remove all event listeners
		DOMResetUndoButton.removeEventListener("click", resetUndoHandler);
		document.body.removeEventListener("click", bodyClickHandler);
		
		// Fade-out popup
		DOMResetUndoPopup.style.opacity = "0";
		window.setTimeout(() => {
			DOMResetUndoPopup.style.visibility = "hidden";
		}, 500);
	});
	
	DOMResetUndoButton.addEventListener("click", resetUndoHandler);
	document.body.addEventListener("click", bodyClickHandler);
}


document.addEventListener("DOMContentLoaded", () => {
	// Reloading the add-on while it add-on page is open often causes spurious errors
	// because the global `browser` object goes missing
	if(typeof(browser) === "undefined") {
		window.location.reload();
		return;
	}
	
	
	browser.storage.local.get(["available", "available-changed", "edit-mode"])
		.then(({ available, "available-changed": availableChanged, "edit-mode": editMode}) => {
			class Views {
				/**
				 * @param {utils.config.StorageArray<utils.config.types.All>} entries
				 */
				constructor(entries) {
					// Single point of truth for the list of available views
					this.table = new DOMEntriesTable(entries);
					this.text  = new DOMEntriesText(entries);
				}
			}
			
			
			/** @type {utils.config.types.All[]} */
			// @ts-ignore
			let availableEntries = available;
			
			/** @type {boolean} */
			// @ts-ignore
			let availableEntriesChanged = availableChanged;
			
			/** @type {keyof Views} */
			// @ts-ignore
			let editModeValue = editMode;
			
			let entries = utils.config.StorageArray.fromArray(
				"available", availableEntries, "available-changed"
			);
			
			// Initialize all available views
			let views = Object.freeze(new Views(entries));
			
			/** @type {(keyof Views)?} */
			let currentViewName = null;
			/**
			 * @param {keyof Views} viewName
			 */
			function changeView(viewName) {
				if(viewName !== currentViewName) {
					for(let [name, view] of Object.entries(views)) {
						if(name !== viewName) {
							view.setVisible(false);
						}
					}
				
					let view = views[viewName];
					view.setVisible(true);
					view.refresh();
				
					browser.storage.local.set({
						"edit-mode": viewName
					}).catch(console.exception);
					
					currentViewName = viewName;
				} else {
					views[viewName].refresh();
				}
			}
			
			/**
			 */
			function refreshView() {
				if(currentViewName !== null) {
					changeView(currentViewName);
				}
				
				browser.storage.local.get("available-changed").then(({"available-changed": changed}) => {
					/** @type {boolean} */
					// @ts-ignore
					let changedValue = changed;
					document.body.setAttribute("data-entries-changed", changedValue.toString());
				});
			}
			
			// Show currently stored view
			changeView(editModeValue);
			document.body.setAttribute("data-entries-changed", availableEntriesChanged.toString());
			
			// Bind "change view" links
			safeQuerySelector(document, "#entries-view-table > a.switch", HTMLAnchorElement).addEventListener("click", (event) => {
				event.preventDefault();
				
				changeView("text");
			});
			safeQuerySelector(document, "#entries-view-text > a.switch", HTMLAnchorElement).addEventListener("click", (event) => {
				event.preventDefault();
				
				changeView("table");
			});
			
			for(let DOMResetLink of document.querySelectorAll("body > section > a.reset")) {
				DOMResetLink.addEventListener("click", async (event) => {
					event.preventDefault();
					
					let previousEntries = entries.slice(0);
					
					let response = await fetch(browser.runtime.getURL("assets/user-agents.txt"));
					let content  = await response.text();
					
					let parser = new utils.config.TextEntryParser(entries);
					await parser.parse(content);
					
					entries.markUnchanged();
					// @ts-ignore
					await browser.storage.local.set({
						"available":         entries,
						"available-changed": false
					});
					
					refreshView();
					
					// Display popup with "Undo" link
					displayResetUndoPopup(refreshView, entries, previousEntries);
				});
			}
		}, console.exception);
});
