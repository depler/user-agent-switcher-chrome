/*
 * User Agent Switcher
 * Copyright © 2019  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* eslint-disable no-unused-vars, no-undef */
"use strict";


/**
 * COMPAT: Polyfill for `Object.fromEntries` on Firefox 62-
 */
if(typeof(Object.fromEntries) !== "function") {
	/**
	 * @template T
	 * @param {[string, T][]} entries
	 */
	Object.fromEntries = (entries) => {
		/** @type {{ [name: string]: T }} */
		let o = {};
		for(let [name, value] of entries) {
			o[name] = value;
		}
		return o;
	};
}


/**
 * COMPAT: `console.exception` is a Firefox-only convenience alias for
 * `console.error`. Provide it in Chrome so that the shared code that logs
 * through it keeps working.
 */
if(typeof(console) !== "undefined" && typeof(console.exception) !== "function") {
	console.exception = (...args) => console.error(...args);
}