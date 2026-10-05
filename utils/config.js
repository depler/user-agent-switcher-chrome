/*
 * User Agent Switcher
 * Copyright © 2017–2019  Erin Yuki Schlarb
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
const __utils_config = (() => {
"use strict";


/**
 * Escape characters using URI-encoding that would cause issues during parsing
 * 
 * @param {string} text
 * @returns {string}
 */
function escapeText(text) {
	return text.replace("%", "%25").replace(":", "%3A").replace("[", "%5B").replace("]", "%5D").replace(",", "%2C").replace(";", "%3B");
}

/**
 * List of default User-Agent categories and their English textual descriptions
 * 
 * The English descriptions hard-coded here should match those added in the English message catalog
 * for the associated MsgID.
 * 
 * @type {utils.config.TextEntryCategories}
 */
const TextEntryCategories = (() => {
	// Compact mapping of message ID basename and their English-language counterparts
	const basename2engText = Object.freeze({
		"desktop": "Desktop",
		"mobile":  "Mobile",
		"bot":     "Bot",
		"other":   "Other"
	});
	
	/** @type {{[name: string]: string}} */
	let constants = {};
	
	const msgid2engText = Object.fromEntries(
		Object.entries(basename2engText).map(([basename, engText]) => {
			let msgid = `useragent_category_${basename}`;
			
			let basenameUpper = basename.toUpperCase();
			constants[`${basenameUpper}_ENGTEXT`] = engText;
			constants[`${basenameUpper}_MSGID`]   = msgid;
			
			return ([msgid, engText]);
		})
	);
	
	const engText2msgid = Object.fromEntries(
		Object.entries(msgid2engText).map(([msgid, engText]) => [engText, msgid])
	);
	
	return Object.assign({
		ENGTEXT2MSGID: Object.freeze(engText2msgid),
		MSGID2ENGTEXT: Object.freeze(msgid2engText),
		
		getEngText2Locale: () => Object.fromEntries(
			Object.entries(msgid2engText).map(([msgid, engText]) =>
				[engText, browser.i18n.getMessage(msgid)]
			)
		),
		getLocale2EngText: () => Object.fromEntries(
			Object.entries(msgid2engText).map(([msgid, engText]) =>
				[browser.i18n.getMessage(msgid), engText]
			)
		)
	}, constants);
})();



/**
 * Simple parser for the `user-agents.txt` text format
 */
class TextEntryParser {
	/**
	 * 
	 * @param {utils.config.types.All[]} entries 
	 */
	constructor(entries=[]) {
		this.entries = entries;
	}
	
	/**
	 * Parse the given file `text` content and add its user-agent entries to the `entries` list
	 *
	 * Unless `append` is set to true this will replace the current entries list instead of
	 * adding to it.
	 *
	 * @param {string}  text
	 * @param {boolean} append
	 * @returns {Promise<utils.config.types.All[]>} `this.entries`
	 */
	async parse(text, append=false) {
		if(!append) {
			// Clear current user-agent list entries
			this.entries.splice(0, this.entries.length);
		}
		
		for(let line of text.split("\n")) {
			line = line.trim();
			
			let offset = line.indexOf(":");
			if(line.length < 1) {
				// Empty line
				this.entries.push({
					"type": "empty"
				});
			} else if(line.startsWith("#")) {
				// Comment line
				this.entries.push({
					"type": "comment",
					
					"text": line.substring(1)
				});
			} else if(offset < 0) {
				// Invalid line
				this.entries.push({
					"type": "invalid",
					
					"text": line
				});
			} else {
				// User-Agent string entry line
				
				// Detect disabled entries
				let enabled = true;
				if(line.startsWith(";")) {
					line = line.substring(1).trim();
					enabled = false;
				}
				
				// Extract the User-Agent string
				let string = line.substring(offset + 1).trim();
				
				// Extract parameters from first part of the User-Agent string line
				let labelAndParams = line.substring(0, offset).trim();
				let paramsOffset = labelAndParams.indexOf("[");
				
				/** @type {string} */
				let label;
				/** @type {string?} */
				let category = null;
				/** @type {string[]} */
				let params;
				if(paramsOffset >= 0 && labelAndParams.endsWith("]")) {
					label  = decodeURIComponent(labelAndParams.substring(0, paramsOffset)).trim();
					params = labelAndParams.substring(paramsOffset + 1, labelAndParams.length - 1).split(",");
					
					category = decodeURIComponent(params[0].trim()).trim();
				} else {
					label = decodeURIComponent(labelAndParams);
				}
				
				// Try to guess a default category for string if none was provided
				/** @type {string} */
				let category2;
				if(category !== null) {
					category2 = category;
				} else if(utils.uaparser) {
					switch((await utils.uaparser.UserAgentParser.parse(string)).getDeviceType()) {
						case "Desktop":
							category2 = TextEntryCategories.DESKTOP_ENGTEXT;
							break;
						
						case "Tablet":
						case "Mobile Phone":
							category2 = TextEntryCategories.MOBILE_ENGTEXT;
							break;
						
						case "Bot":
							category2 = TextEntryCategories.BOT_ENGTEXT;
							break;
						
						default:
							category2 = TextEntryCategories.OTHER_ENGTEXT;
					}
				} else {
					category2 = TextEntryCategories.OTHER_ENGTEXT;
				}
				
				this.entries.push({
					"type": "user-agent",
					"enabled": enabled,
					
					"label":    label,
					"category": category2,
					"string":   string
				});
			}
		}
		
		return this.entries;
	}
	
	/**
	 * Serialize the current `entries` list as human-readable text
	 *
	 * @returns {string}
	 */
	serialize() {
		let text = [];
		for(let entry of this.entries) {
			switch(entry.type) {
				case "empty":
					break;
				
				case "comment":
					text.push("#", entry.text);
					break;
				
				case "invalid":
					text.push(entry.text);
					break;
				
				case "user-agent":
					if(!entry.enabled) {
						text.push(";");
					}
					
					// Add label
					text.push(escapeText(entry.label));
					
					// Add other parameters
					// This also escapes the coma-character "," so that we can extend the format
					// later on.
					text.push(" [", escapeText(entry.category), "]");
					
					text.push(": ", entry.string);
					break;
			}
			
			text.push("\n");
		}
		text.pop();
		
		return text.join("");
	}
}


/**
 * Sub-class of `Array` that can be loaded from and written to the add-on
 * options storage
 *
 * Automatically tracks whether the actual value has changed from the initial
 * state using a non-cryptographic hash function.
 */
class StorageArray extends Array {
	/**
	 * @param {string} name        Storage name at which to store the
	 *                             configuration data
	 * @param {string} nameChanged Storage name at which to store a flag
	 *                             indicating that the data has been changed
	 */
	constructor(name, nameChanged) {
		super(0);
		
		this._nameArray   = name;
		this._nameChanged = nameChanged;
		
		this._originalHash = 2914; // .hashCode() of `[]`
	}
	
	/**
	 * Create a {@see StorageArray} object using the given data
	 * 
	 * @template T
	 * @param {string} name        Storage name at which to store the
	 *                             configuration data
	 * @param {T[]}    data        The initial data stored
	 * @param {string} nameChanged Storage name at which to store a flag
	 *                             indicating that the data has been changed
	 * @returns {utils.config.StorageArray<T>}
	 */
	static fromArray(name, data, nameChanged) {
		let self = new StorageArray(name, nameChanged);
		Array.prototype.push.apply(self, data);
		self.markUnchanged();
		return self;
	}
	
	/**
	 * Load an {@see StorageArray} object from the browser storage system
	 * 
	 * @throws {ReferenceError} There was no array at storage name {@see name}
	 * @param {string} name        Storage name at which the configuration data
	 *                             is stored
	 * @param {string} nameChanged Storage name at which to store a flag
	 *                             indicating when the data has been changed
	 * @returns {Promise<utils.config.StorageArray<any>>}
	 */
	static load(name, nameChanged) {
		return browser.storage.local.get(name).then((result) => {
			let resultValue = result[name];
			if(!(resultValue instanceof Array)) {
				throw new ReferenceError(`Storage array at name "${name}" is undefined`);
			}
			return StorageArray.fromArray(name, resultValue, nameChanged);
		});
	}
	
	/**
	 * Produce a relatively unique integer value that changes based on current
	 * contents of this Array
	 * 
	 * @returns {number}
	 */
	hashCode() {
		// Based on: http://stackoverflow.com/a/7616484/277882
		let string = JSON.stringify(this);
		let hash   = 0;
		if(string.length === 0) {
			return hash;
		}
		
		for(let i = 0; i < string.length; i++) {
			let chr = string.charCodeAt(i);
			
			hash  = ((hash << 5) - hash) + chr;
			hash |= 0; // Convert to 32bit integer
		}
		
		return hash;
	}
	
	
	/**
	 * Recalculate what is considered the current, unchanged value of this Array
	 */
	markUnchanged() {
		this._originalHash = this.hashCode();
	}
	
	/**
	 * Check whether the current value of this array is different from the
	 * initial value
	 * 
	 * @returns {boolean}
	 */
	get changed() {
		return (this._originalHash !== this.hashCode());
	}
	
	
	/**
	 * Commit the current data to the browser storage system, setting the
	 * "data modified" flag if appropriate
	 * 
	 * @returns {Promise<void>}
	 */
	store() {
		return browser.storage.local.set({
			[this._nameArray]: this,
			[this._nameChanged]: this.changed
		});
	}
}


return Object.freeze({
	StorageArray:        StorageArray,
	TextEntryCategories: TextEntryCategories,
	TextEntryParser:     TextEntryParser,
});
})();