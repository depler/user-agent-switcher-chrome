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

declare namespace utils.matchingengine {
	// Make objects from JS code available to the typing system
	interface MatchingEngine {
		readonly haveItemsCached: boolean;
		enumerateCachedItems(): IterableIterator<DataItem<any>>;
		isKeyStorageKey(key: string): boolean;
		getStorageKeyForHostname(hostname: string): string;
		readStorageDataForHostname(hostname: string, useCache?: boolean): Promise<{ [pattern: string]: DataItem<any> }>;
		writeStorageDataForHostname(hostname: string, data: object | null): Promise<void>;
		findContentInStorageData(url: URL, data?: object): DataItem<any> | null;
		findItem(url: URL | null): Promise<DataItem<any> | null>;
		findItemInCache(url: URL | null): DataItem<any> | null;
		putItem(dataItem: DataItem<any>): Promise<DataItem<any>>;
		removeItem(dataItem: DataItem<any>): Promise<void>;
		moveItem(dataItem: DataItem<any>, newPattern: MatchingPattern): Promise<DataItem<any>>;
	}
	
	
	interface MatchingPattern {
		hostname: string;
		protocol: string;
		port:     string;
		isWildcard: boolean;
		
		readonly minimalPort:     number | null;
		readonly maximalPort:     number | null;
		readonly minimalProtocol: string;
		readonly isHostnameIPAddress: boolean;
		
		toString(withWildcard?: boolean): string;
		toBrowserMatchPattern(): string;
		toBrowserGlobPatternList(): string[];
		toBrowserUrlFilterList(): browser.events.UrlFilter[];
		clone(): MatchingPattern;
		equals(pattern: MatchingPattern): boolean;
		match(url: URL): boolean;
	}
	
	/**
	 * General definition of an object that will be read from or written to
	 * storage
	 * */
	interface DataItem<T extends object> {
		pattern: MatchingPattern,
		content: T
	}
}