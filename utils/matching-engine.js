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


const __utils_matchingengine = (() => {
/* global psl */
"use strict";


const URLUtils = Object.freeze({
	// List of default ports for location-based protocols we may realistically
	// encounter in a browser
	PROTOCOL_DEFAULT_PORTS: Object.freeze({
		// HTTP
		"http":  80,
		"https": 443, // Including HTTP/2 over QUIC/UDP
		
		// FTP
		"ftp":   21,
		"ftps":  990,
		"ftpes": 21,
		
		// Extension stuff
		"sftp":   22,
		"gopher": 70
	}),
	
	
	/**
	 * Find the shortest possible form of expressing the given port for the
	 * given protocol string
	 *
	 * @param {string|number?} port
	 * @param {string}         protocol
	 * @returns {number?}
	 */
	findMinimalPortForProtocol: function(port, protocol) {
		// Normalize port to be a numeric value or `null`
		port = (typeof(port) === "string" && port.length > 0) ? parseInt(port) : port;
		port = (typeof(port) === "number" && isFinite(port))  ? port           : null;
		
		// Return if port is already in minimal form for its protocol
		if(!port) {
			return null;
		}
		
		// Normalize protocol to *not* end with a colon
		protocol = protocol.replace(/:$/, "");
		
		if(URLUtils.PROTOCOL_DEFAULT_PORTS.hasOwnProperty(protocol)
		// @ts-ignore: The previous line ensures that the next line is safe
		&& port === URLUtils.PROTOCOL_DEFAULT_PORTS[protocol]) {
			// Port is default port of protocol – we don't need to write it as
			// part of any address
			return null;
		} else {
			return port;
		}
	},
	
	/**
	 * @param {string|number?} port
	 * @param {string}         protocol
	 * @return {number?}
	 */
	findMaximalPortForProtocol: function(port, protocol) {
		// Normalize port to be a numeric value or `null`
		port = (typeof(port) === "string" && port.length > 0) ? parseInt(port) : port;
		port = (typeof(port) === "number" && isFinite(port))  ? port           : null;
		
		// Return if we already have a port number at this point
		if(port) {
			return port;
		}
		
		// Normalize protocol to *not* end with a colon
		protocol = protocol.replace(/:$/, "");

		if(URLUtils.PROTOCOL_DEFAULT_PORTS.hasOwnProperty(protocol)) {
			// Found protocol default port
			// @ts-ignore: The previous line ensures that the next line is safe
			return this.PROTOCOL_DEFAULT_PORTS[protocol];
		} else {
			// Default port not found – give up
			return null;
		}
	},
	
	/**
	 * Check whether the given hostname is actually an IP address
	 * 
	 * @param {string} hostname The hostname to check
	 * 
	 * @return {boolean}
	 */
	isHostnameIPAddress: function(hostname) {
		if(hostname.includes(":")) {
			// IPv6 address include colons, but DNS names may never do that
			return true;
		}
		
		let segments = hostname.split(".");
		if(segments.filter(segment => /^\d+$/.test(segment)).length === 4) {
			// Four name segments that are only made up of digits → IPv4
			return true;
		}
		
		return false;
	}
});



class MatchingPattern {
	/**
	 * Construct matching pattern from {@link URL}-like object
	 * 
	 * @param {object}   options
	 * @param {string}   options.hostname
	 * @param {string}   options.protocol
	 * @param {string}   options.port
	 * @param {boolean} [options.isWildcard]
	 */
	constructor(options) {
		this.hostname = options.hostname;
		this.protocol = options.protocol;
		this.port     = options.port;
		({ isWildcard: this.isWildcard = false } = options);
	}
	
	
	
	/**
	 * @return {number?} The current port number or `null` if no port number
	 *                   is required for the current protocol
	 */
	get minimalPort() {
		return URLUtils.findMinimalPortForProtocol(this.port, this.protocol);
	}
	
	/**
	 * @return {number?} The current port number if set, otherwise the default
	 *                   port number of the protocol or `null` if that could
	 *                   not be determined
	 */
	get maximalPort() {
		return URLUtils.findMaximalPortForProtocol(this.port, this.protocol);
	}
	
	/**
	 * @return {string} The current protocol value without the trailing colon
	 */
	get minimalProtocol() {
		return this.protocol.replace(/:$/, "");
	}
	
	/**
	 * @return {boolean} Whether the currently set hostname is an IP address
	 */
	get isHostnameIPAddress() {
		return URLUtils.isHostnameIPAddress(this.hostname);
	}
	
	
	
	/**
	 * Convert this matching pattern to a user-friendly string from
	 *
	 * Note however that the returned value will *not* necessarily be parsable
	 * by {@link URL} unless you set {@param withWildcard} to `false`.
	 * 
	 * @param {boolean} withWildcard Show wildcards as `*.` before the hostname?
	 *
	 * @returns {string}
	 */
	toString(withWildcard=true) {
		withWildcard = withWildcard && this.isWildcard;
		
		let hostnameString = withWildcard ? `*.${this.hostname}` : this.hostname;
		let portString     = this.port    ? `:${this.port}`      : "";
		return `${this.minimalProtocol}://${hostnameString}${portString}/`;
	}
	
	/**
	 * Convert this matching pattern into a browser matching pattern as specified in
	 * https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns.
	 * 
	 * Note that the `port` property cannot be represented in this format and will
	 * be dropped in the process.
	 * 
	 * @returns {string}
	 */
	toBrowserMatchPattern() {
		let hostnameString = this.isWildcard ? `*.${this.hostname}` : this.hostname;
		return `${this.minimalProtocol}://${hostnameString}/*`;
	}
	
	/**
	 * Convert this matching pattern into a list of one or two OR'd content_script
	 * [glob pattern](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/manifest.json/content_scripts#Matching_URL_patterns)
	 * strings that, when combined, will match this pattern exactly.
	 * 
	 * Note: Glob pattern wildcards will match the entire URL string possibly
	 * leading to false-positives for URLs such as
	 * https://somedomain.invalid/path/something.other-domain.com/
	 * if this is a wildcard matching pattern for `https://*.other-domain.com/`.
	 * Combining the glob pattern with a regular browser match pattern should
	 * avoid this issue in next to all cases through.
	 * 
	 * @returns {string[]}
	 */
	toBrowserGlobPatternList() {
		if(this.isWildcard) {
			return [`${this.toString(false)}*`, `${this.toString(true)}*`];
		} else {
			return [`${this.toString(false)}*`];
		}
	}
	
	/**
	 * Convert this matching pattern into a list of one or two OR'd
	 * [URL filter](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/events/UrlFilter)
	 * objects that, we combined, will match this pattern exactly.
	 * 
	 * @returns {browser.events.UrlFilter[]}
	 */
	toBrowserUrlFilterList() {
		// Add strict domain matching filter
		/** @type {browser.events.UrlFilter} */
		let urlFilterStrict = {
			schemes: [this.minimalProtocol.toLowerCase()],
			ports:   this.maximalPort ? [this.maximalPort] : undefined,
			hostEquals: this.hostname
		};
		
		// Additionally add suffix filter with leading dot for wildcards
		if(this.isWildcard) {
			let urlFilterWildcard = Object.assign({}, urlFilterStrict);
			urlFilterWildcard = Object.assign({}, urlFilterStrict);
			urlFilterWildcard.hostSuffix = `.${this.hostname}`;
			delete urlFilterWildcard.hostEquals;
			return [urlFilterStrict, urlFilterWildcard];
		} else {
			return [urlFilterStrict];
		}
	}
	
	
	/**
	 * @return {MatchingPattern}
	 */
	clone() {
		return new MatchingPattern(this);
	}
	
	/**
	 * Check whether this object is equivalent to some other pattern object
	 * 
	 * @param {MatchingPattern} pattern The pattern object to compare with
	 * @return {boolean}
	 */
	equals(pattern) {
		return (pattern instanceof MatchingPattern)
			&& this.isWildcard      === pattern.isWildcard
			&& this.hostname        === pattern.hostname
			&& this.minimalProtocol === pattern.minimalProtocol
			&& this.minimalPort     === pattern.minimalPort;
	}
	
	
	/**
	 * Attempt to match this pattern against the given {@link URL}-like object
	 *
	 * @param {URL} url
	 */
	match(url) {
		// Match the protocol scheme
		let urlMinimalProtocol = url.protocol.replace(/:$/, "");
		if(this.minimalProtocol !== urlMinimalProtocol) {
			return false;
		}
		
		// Match the hostname (including subdomain wildcards)
		if(this.hostname !== url.hostname
		&&(!this.isWildcard || !url.hostname.endsWith(`.${this.hostname}`))) {
			return false;
		}
		
		// Match the port number
		let urlMaximalPort = URLUtils.findMaximalPortForProtocol(url.port, urlMinimalProtocol);
		if(this.maximalPort && this.maximalPort !== urlMaximalPort) {
			return false;
		}
		
		return true;
	}
}



/**
 * @typedef {utils.matchingengine.DataItem<any>} DataItem
 */

/**
 * @typedef {{ [patternStr: string]: DataItem }} StorageEntry
 */

/**
 * @typedef {{ [key: string]: StorageEntry }} StorageCache
 */



class MatchingEngine {
	/**
	 * @param {string}  topic The storage topic prefix to use when doing lookups
	 * @param {object?} cache Object to use for caching data
	 *                        (setting this to `null` disables the in-memory cache)
	 */
	constructor(topic, cache = null) {
		this.topic = topic;
		/** @type {StorageCache?} */
		this.cache = cache;
	}
	
	/**
	 * Are there any items in cache that may match on some URL?
	 * 
	 * @returns {boolean}
	 */
	get haveItemsCached() {
		for(let _ of this.enumerateCachedItems()) {
			return true;
		}
		return false;
	}
	
	/**
	 * Enumerate all data items currently in cache
	 * 
	 * @returns {IterableIterator<DataItem>}
	 */
	* enumerateCachedItems() {
		if(!this.cache) {
			return;
		}
		
		for(let key of Object.keys(this.cache)) {
			if(this.cache.hasOwnProperty(key) && this.isKeyStorageKey(key)
			&& typeof(this.cache[key]) === "object") {
				for(let dataItem of Object.values(this.cache[key])) {
					yield {
						pattern: new MatchingPattern(dataItem.pattern),
						content: Object.assign({}, dataItem.content),
					};
				}
			}
		}
	}
	
	/**
	 * Return whether the given key may be a cache key used by this matching
	 * engine
	 * 
	 * @param {string} key The key to match
	 * @returns {boolean}
	 */
	isKeyStorageKey(key) {
		return key.startsWith(`${this.topic}:`);
	}
	
	/**
	 * Generate the storage lookup key for the given hostname and the stored
	 * topic
	 *
	 * @param {string} hostname An IDNA hostname value
	 * @return {string}
	 */
	getStorageKeyForHostname(hostname) {
		hostname = (psl.get(hostname) || hostname);
		
		return `${this.topic}:${hostname}`;
	}
	
	/**
	 * Lookup all storage data for the given hostname as well as everything
	 * else related to the same base domain
	 *
	 * @param {string}  hostname An IDNA-compatible hostname value
	 * @param {boolean} useCache Try using the cache if it is enabled?
	 * @return {Promise<StorageEntry>}
	 */
	async readStorageDataForHostname(hostname, useCache=true) {
		let key = this.getStorageKeyForHostname(hostname);
		
		// Retrieve data from cache or browser storage
		/** @type {StorageEntry?} */
		let results = null;
		if(useCache && this.cache && this.cache.hasOwnProperty(key)) {
			results = this.cache[key];
		}
		if(!results) {
			results = (/** @type {any} */ (await browser.storage.local.get(key))[key]);
			
			// Remember value if the lookup succeeded and the cache is enabled
			if(this.cache && results) {
				this.cache[key] = results;
			}
		}
		
		return results ? results : {};
	}
	
	
	/**
	 * Note that this will also overwrite all the other data associated with
	 * the same base domain
	 *
	 * Is is strongly recommended to use the higher-level {@link putContent}
	 * instead.
	 *
	 * @param {string} hostname The hostname whose data should be replaced
	 * @param {StorageEntry?} data The data to write
	 */
	async writeStorageDataForHostname(hostname, data) {
		let key = this.getStorageKeyForHostname(hostname);
		
		if(data !== null && typeof(data) === "object") {
			let keys = {};
			keys[key] = data;
			await browser.storage.local.set(keys);
			
			// Also update cache
			if(this.cache) {
				this.cache[key] = data;
			}
		} else {
			await browser.storage.local.remove([key]);
			
			// Also update cache
			if(this.cache) {
				delete this.cache[key];
			}
		}
	}
	
	/**
	 * @param {URL}          url  The URL to attempt to match in the given dataset
	 * @param {StorageEntry} data A hostname dataset
	 * @return {DataItem?}
	 */
	findContentInStorageData(url, data={}) {
		//TODO: Stable matching order: Exact before wildcards, longest before shortest
		for(let patternStr of Object.keys(data)) {
			let pattern = new MatchingPattern(data[patternStr].pattern);
			if(pattern.match(url)) {
				let result = Object.assign({}, data[patternStr]);
				result.pattern = pattern;
				return result;
			}
		}
		
		return null;
	}
	
	/**
	 * Look for data associated with the given URL
	 * 
	 * @param {URL?} url The URL that should be attempted to be matched
	 * @return {Promise<DataItem?>}
	 */
	async findItem(url) {
		if(url) {
			let storage = await this.readStorageDataForHostname(url.hostname);
			return this.findContentInStorageData(url, storage);
		} else {
			return null;
		}
	}
	
	/**
	 * Look IN CACHE ONLY for data associated with the given URL
	 * 
	 * @param {URL?} url The URL that should be attempted to be matched
	 * @return {DataItem?}
	 */
	findItemInCache(url) {
		if(url && this.cache) {
			// Retrieve data from cache;
			let key = this.getStorageKeyForHostname(url.hostname);
			let results = this.cache.hasOwnProperty(key) ? this.cache[key] : null;
			if(results) {
				return this.findContentInStorageData(url, results);
			} else {
				return null;
			}
		} else {
			return null;
		}
	}
	
	/**
	 * @param {DataItem} dataItem The data object to store
	 * @returns {Promise<DataItem>}
	 */
	async putItem(dataItem) {
		// Get current storage data for hostname of pattern
		let storage = await this.readStorageDataForHostname(dataItem.pattern.hostname, false);
		
		// Add/replace data for the given pattern
		storage[dataItem.pattern.toString()] = dataItem;
		
		// Write back new storage data
		await this.writeStorageDataForHostname(dataItem.pattern.hostname, storage);
		
		return dataItem;
	}
	
	/**
	 * @param {DataItem} dataItem The matching pattern of the content to remove
	 */
	async removeItem(dataItem) {
		// Get current storage data for hostname of pattern
		let storage = await this.readStorageDataForHostname(dataItem.pattern.hostname, false);
		
		// Remove data for the given pattern
		delete storage[dataItem.pattern.toString()];
		
		if(Object.keys(storage).length >= 1) {
			// Write back new storage data
			await this.writeStorageDataForHostname(dataItem.pattern.hostname, storage);
		} else {
			// Clear storage for the given hostname
			await this.writeStorageDataForHostname(dataItem.pattern.hostname, null);
		}
	}
	
	/**
	 * @param {DataItem}        dataItem   The data whose matching pattern should be changed
	 * @param {MatchingPattern} newPattern The matching pattern to move the data object to
	 * @return {Promise<DataItem>} The updated data item
	 */
	async moveItem(dataItem, newPattern) {
		let storageKeyOld = this.getStorageKeyForHostname(dataItem.pattern.hostname);
		let storageKeyNew = this.getStorageKeyForHostname(newPattern.hostname);
		if(storageKeyOld === storageKeyNew) {
			// Get current storage data for hostname of pattern
			let storage = await this.readStorageDataForHostname(dataItem.pattern.hostname, false);
			
			// Remove previous data for the given pattern
			delete storage[dataItem.pattern.toString()];
			
			// Update data item pattern
			dataItem.pattern = newPattern;
			
			// Add/replace data item at new location
			storage[dataItem.pattern.toString()] = dataItem;
			
			// Write back new storage data
			await this.writeStorageDataForHostname(dataItem.pattern.hostname, storage);
		} else {
			// Drop item from previous storage section
			await this.removeItem(dataItem);
			
			// Update data item pattern
			dataItem.pattern = newPattern;
			
			// Add/replace item in storage section
			await this.putItem(dataItem);
		}
		
		return dataItem;
	}
}


return Object.freeze({
	MatchingEngine:  MatchingEngine,
	MatchingPattern: MatchingPattern,
	URLUtils:        URLUtils,
});
})();