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

/* eslint-disable no-unused-vars, no-undef */
"use strict";


/**
 * Function that returns `null` but declares its return types as `never`
 * to avoid TypeScript picking up this fact and (correctly) declaring the
 * module to have type `<module_type|null>`
 * 
 * @returns {never}
 */
function null_hack() {
	//@ts-ignore
	return null;
}


/**
 * Definitions of global objects used in absence of ES6 modules
 * 
 * XXX: Switch to ES6 modules once we don't need to support Waterfox 56.*
 */
const utils = {
	config:         typeof(__utils_config)         !== "undefined" ? __utils_config         : null_hack(),
	matchingengine: typeof(__utils_matchingengine) !== "undefined" ? __utils_matchingengine : null_hack(),
	uaparser:       typeof(__utils_uaparser)       !== "undefined" ? __utils_uaparser       : null_hack(),
};