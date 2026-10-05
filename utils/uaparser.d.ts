/*
 * User Agent Switcher
 * Copyright © 2018–2019  Erin Yuki Schlarb
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

declare namespace utils.uaparser {
	// Make objects from JS code available to the typing system
	type UserAgentParser = utils.uaparser.UserAgentParser;
	
	
	interface DataSet {
		/**
		 * The original User-Agent value
		 */
		userAgent: string;
		
		/**
		 * A sensible `navigator.platform` for the User-Agent
		 */
		platform: string?;
		
		/**
		 * A sensible `navigator.appVersion` for the User-Agent
		 */
		appVersion: string;
		
		/**
		 * A sensible `navigator.buildID` (Firefox) for the User-Agent
		 */
		buildID: string | undefined;
		
		/**
		 * A sensible `navigator.cpuClass` (Internet Explorer) for the User-Agent
		 */
		cpuClass?: string | undefined;
		
		/**
		 * A sensible `navigator.oscpu` (Firefox) for the User-Agent
		 */
		oscpu?: string | null | undefined;
		
		/**
		 * A sensible `navigator.product` for the User-Agent
		 */
		product: string;
		
		/**
		 * A sensible `navigator.productSub` for the User-Agent
		 */
		productSub: string | undefined;
		
		/**
		 * A sensible `navigator.vendor` for the User-Agent
		 */
		vendor: string;
		
		/**
		 * A sensible `navigator.vendorSub` for the User-Agent
		 */
		vendorSub: string | undefined;
	}
}