class CacheClass {
	constructor(content, success) {
		this.content = content;
		this.success = success;
	}
}


class BrowscapCache {
	constructor(dataFolder) {
		this._version = null;
		this._dataFolder = dataFolder;
	}

	/**
	 * Detected browscap version
	 *
	 * @returns {string}
	 */
	getVersion() {
		if(this._version === null) {
			return this.getItem('browscap.version', false).then((version) => {
				if(version.content !== null && version.success) {
					this._version = version.content;
				}
				
				return this._version;
			});
		} else {
			return Promise.resolve(this._version);
		}
	}
	
	/**
	 * Get an item.
	 *
	 * @param cacheId
	 * @param withVersion
	 * @returns {CacheClass}
	 */
	getItem(cacheId, withVersion=true) {
		return this.getCacheId(cacheId, withVersion).then((cacheId) => {
			return fetch(this.getPath(cacheId), {
				redirect: "follow"
			});
		}).then((response) => {
			return response.ok ? response.json() : null;
		}).then((object) => {
			if(object === null
			|| typeof(object) === "undefined"
			|| typeof(object.content) === "undefined") {
				return new CacheClass(null, false);
			} else {
				return new CacheClass(object.content, true);
			}
		});
	}
	
	/**
	 * Get an item.
	 *
	 * @param cacheId
	 * @param withVersion
	 * @returns {CacheClass}
	 */
	hasItem(cacheId, withVersion) {
		return this.getCacheId(cacheId, withVersion).then((cacheId) => {
			return fetch(this.getPath(cacheId), {
				method: "HEAD",
				redirect: "follow"
			});
		}).then((response) => {
			return response.ok;
		});
	}
	
	/**
	 * Get the final cache ID of an item (including the version, etc.)
	 * @param {String} cacheId 
	 * @param {Boolean} withVersion 
	 */
	getCacheId(cacheId, withVersion=true) {
		if(withVersion) {
			return this.getVersion().then((version) => {
				return `${cacheId}.${version}`;
			});
		} else {
			return Promise.resolve(cacheId);
		}
	}
	
	/**
	 * creates the name of the cache file for an cache key
	 *
	 * @param keyname
	 * @returns {string}
	 */
	getPath(keyname) {
		return `${this._dataFolder}/${keyname}.json`;
	}
}
module.exports = BrowscapCache;
