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

declare namespace popup {
	/**
	 * Single User-Agent list entry
	 */
	type Entry = {
		label:     string,
		userAgent: string
	};
	
	/**
	 * Localized category name and list of User-Agent entries
	 */
	type CategoryData = [string, Entry[]];
	
	/**
	 * Mapping of category localized names to their data
	 */
	type Categories = Map<string, CategoryData>;
}