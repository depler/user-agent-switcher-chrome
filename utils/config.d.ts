/*
 * User Agent Switcher
 * Copyright © 2018-2019  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


declare namespace utils.config {
	// Make objects from JS code available to type system
	type TextEntryParser  = utils.config.TextEntryParser;
	
	/**
	 * Interface of accessing translations for category entries
	 */
	interface TextEntryCategories {
		/**
		 * Mapping of English category labels to their message IDs
		 */
		ENGTEXT2MSGID: Readonly<{ [engText: string]: string }>;
		
		/**
		 * Mapping of category message IDs their English labels
		 */
		MSGID2ENGTEXT: Readonly<{ [msgid: string]: string }>;
		
		
		/**
		 * Retrieve mapping of English category labels to their localized equivalents
		 */
		getEngText2Locale(): { [engText: string]: string };
		
		/**
		 * Retrieve mapping of localized category labels to their English equivalents
		 */
		getLocale2EngText(): { [localeText: string]: string };
		
		
		/**
		 * Constants for accessing category labels and original messages
		 *
		 * `${CATEGORY.toUpperCase()}_MSGID`   Message ID for the given category name
		 * `${CATEGORY.toUpperCase()}_ENGTEXT` English description of the given category name
		 */
		[msgid: string]: string;
	}
	
	
	interface StorageArray<T> extends Array<T> {
		/**
		 * Produce a relatively unique integer value that changes based on current
		 * contents of this Array
		 */
		hashCode(): number;
		
		/**
		 * Recalculate what is considered the current, unchanged value of this Array
		 */
		markUnchanged(): void;
		
		/**
		 * Check whether the current value of this array is different from the
		 * initial value
		 */
		readonly changed: boolean;
		
		/**
		 * Commit the current data to the browser storage system, setting the
		 * "data modified" flag if appropriate
		 */
		store(): Promise<void>;
	}
	
	
	/**
	 * Object types that may be encountered when reading the configuration
	 * from storage
	 */
	namespace types {
		interface Empty {
			type: "empty"
		}
		
		interface Comment {
			type: "comment",
			
			text: string
		}
		
		interface Invalid {
			type: "invalid",
			
			text: string
		}
		
		interface UserAgent {
			type: "user-agent",
			enabled: boolean,
			
			label:    string,
			category: string,
			string:   string
		}
		
		type All = Empty | Comment | Invalid | UserAgent;
	}
	
	
	/**
	 * List of all options present in storage
	 */
	interface Options {
		"current": string | null;
		
		"available":         types.All[];
		"available-changed": boolean;
		
		"random-enabled":    boolean;
		"random-categories": string[];
		"random-interval":   OptionsRandomInterval;
		"random-jitter":     number;
		
		"show-badge-text":     boolean;
		"override-popup-size": boolean;
		"popup-collapsed":     string[];
		
		"edit-mode": "table" | "text";
	}
	
	interface OptionsDynamic extends Options {
		[key: string]: browser.storage.StorageValue
	}
	
	interface OptionsRandomInterval {
		mode:  "timed" | "startup";
		value: number;
		unit:  "m" | "h" | "d";
	}
}