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
 * XXX: Switch to ES6 modules once they're supported by the latest Firefox ESR
 */
const popup = Object.freeze({
	collapsible: typeof(__popup_collapsible) !== "undefined" ? __popup_collapsible : null_hack(),
	agentlist:   typeof(__popup_agentlist)   !== "undefined" ? __popup_agentlist   : null_hack(),
	override:    typeof(__popup_override)    !== "undefined" ? __popup_override    : null_hack(),
	randommode:  typeof(__popup_randommode)  !== "undefined" ? __popup_randommode  : null_hack(),
});