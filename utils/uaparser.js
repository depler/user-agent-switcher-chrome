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


const __utils_uaparser = (() => {
/* global require */
"use strict";

const browscap = (() => {
	// @ts-ignore
	if(typeof(require) === "undefined") {
		return null;
	}
	
	// @ts-ignore
	let require_func = require;  // Workaround for severe TS issue when require fails
	const Browscap = require_func("browscap");
	return new Browscap(
		browser.runtime.getURL("deps/browscap-json-cache-files/build/sources"),
		{iniPartCacheBytes: 2, patternCacheBytes: 1}
	);
})();


class UserAgentParser {
	/**
	 * @param {string} userAgent The User-Agent parsed
	 * @param {*}      [browser] The Browscap parsing result for the given
	 *                           User-Agent string
	 * @internal
	 */
	constructor(userAgent, browser) {
		this.browser = browser;
		this.userAgent = userAgent;
		if(browser) {
			console.info("%cUser-Agent Switcher%c: Parsed User-Agent string:",
				"font-weight: bold; color: white; background: goldenrod;",
				"font-weight: normal; color: inherit; background: transparent;",
			);
			console.groupCollapsed("", userAgent);
			console.table(Object.assign({
				"(DeviceType)": this.getDeviceType()
			}, this.asObject()));
			console.info("If this seems incorrect, please ask for a BrowsCap update!");
			console.groupEnd();
		}
	}
	
	
	/**
	 * Parse the given User-Agent string using Browscap and return the
	 * `UserAgentParser` object when done
	 * 
	 * @param {string} userAgent User agent string to parse
	 * @returns {Promise<UserAgentParser>}
	 */
	static parse(userAgent) {
		return Promise.resolve(browscap.getBrowser(userAgent)).then((browser) => {
			return new UserAgentParser(userAgent, browser);
		});
	}
	
	
	/**
	 * Export the parsed data as JSON object
	 * 
	 * @returns {utils.uaparser.DataSet}
	 */
	asObject() {
		return {
			userAgent:  this.userAgent,
			platform:   this.platform,
			
			appVersion: this.appVersion,
			buildID:    this.buildID,
			cpuClass:   this.cpuClass,
			oscpu:      this.oscpu,
			product:    this.product,
			productSub: this.productSub,
			vendor:     this.vendor,
			vendorSub:  this.vendorSub,
		};
	}
	
	
	/**
	 * Return the guessed device type from the given string
	 */
	getDeviceType() {
		let deviceType = this.browser["Device_Type"];
		if(!deviceType && this.browser["Browser_Type"] == "Bot/Crawler") {
			deviceType = "Bot";
		}
		return deviceType;
	}
	
	
	/**
	 * Try to make up a sensible/convincing `navigator.platform` string
	 *
	 * Based on: https://stackoverflow.com/a/19883965/277882
	 * 
	 * @returns {string?}
	 */
	get platform() {
		// Note that any CPU architectures (if provided) try to reflect the most common
		// results on the given platform – there are cases where they may be inaccurate
		// (i.e. an x86 Android Tablet reporting as "armv7l")
		if(this.browser["Device_Name"] === "Windows Desktop") {
			return `Win${this.browser["Browser_Bits"]}`;
		} else if(this.browser["Platform"] === "Linux") {
			if(this.browser["Platform_Bits"] == 64 && this.browser["Browser_Bits"] == 32) {
				// 32-bit browser on 64-bit Desktop Linux
				return "Linux i686 on x86_64";
			} else {
				return "Linux " + (this.browser["Browser_Bits"] != 64 ? "i686" : "x86_64");
			}
		} else if(this.browser["Platform"] === "macOS" || this.browser["Platform"] === "MacOSX") {
			return "MacIntel";
		} else if(this.browser["Platform"] == "Android") {
			return "Linux " + (this.browser["Browser_Bits"] != 64 ? "armv7l" : "aarch64");
		} else if(this.browser["Platform"] === "iOS") {
			return this.browser["Device_Name"];
		} else if(this.browser["Platform"] === "FreeBSD") {
			return "FreeBSD " + (this.browser["Browser_Bits"] != 64 ? "i386" : "amd64");
		} else if(this.browser["Platform"] === "OpenBSD") {
			return "OpenBSD " + (this.browser["Browser_Bits"] != 64 ? "i386" : "amd64");
		} else {
			return this.browser["Platform"] || this.browser["Device_Name"] || null;
		}
	}
	
	
	/**
	 * Try to make up a sensible/convincing value for the `navigator.appVersion`
	 * property
	 * 
	 * Based on: https://wiki.selfhtml.org/wiki/JavaScript/Navigator/appVersion
	 * 
	 * @returns {string}
	 */
	get appVersion() {
		if(this.browser["Browser"] === "Firefox") {
			let rawPlatformMatch = this.userAgent.match(/^Mozilla\/5\.0 \(([A-Za-z0-9]+)/);
			if(rawPlatformMatch) {
				return `5.0 (${rawPlatformMatch[1]})`;
			}
		} else if(this.userAgent.startsWith("Mozilla/5.0 ")) {
			return `5.0 ${this.userAgent.split(" ").slice(1).join(" ")}`;
		}
		
		return "5.0";
	}
	
	
	/**
	 * Try to make up a sensible/convincing `navigator.buildID` string
	 * 
	 * Unless the User-Agent string is from a Mozilla-based browser this property
	 * will return `undefined`.
	 *
	 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/buildID
	 *
	 * @returns {string | undefined}
	 */
	get buildID() {
		if(this.browser["Browser"] !== "Firefox") {
			return undefined;
		}
		
		return "20181001000000";  // Hard-coded since FF 64
	}
	
	
	/**
	 * Try to make up a sensible/convincing value for the Internet Explorer
	 * `nagivator.cpuClass` string
	 * 
	 * Unless the User-Agent string is from Internet Explorer this property will
	 * return `undefined`.
	 * 
	 * Based on: https://stackoverflow.com/a/6267019
	 * 
	 * @returns {string|undefined}
	 */
	get cpuClass() {
		if(this.browser["Browser"] !== "IE") {
			return undefined;
		}
		
		return this.browser["Browser_Bits"] == 64 ? "x64" : "x86";
	}
	
	
	/**
	 * Try to make up a sensible/convincing `navigator.oscpu` string
	 * 
	 * Unless the User-Agent string is from a Mozilla-based browser this property
	 * will return `undefined`.
	 *
	 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/oscpu
	 *
	 * @returns {string? | undefined}
	 */
	get oscpu() {
		if(this.browser["Browser"] !== "Firefox") {
			return undefined;
		}
		
		if(this.browser["Device_Name"] === "Windows Desktop") {
			let oscpu = "Windows NT";
			
			// Platform version
			if(this.browser["Platform_Version"]) {
				oscpu += " " + this.browser["Platform_Version"];
			}
			
			// 64-bit CPUs
			if(this.browser["Platform_Bits"] == 64) {
				oscpu += "; " + (this.browser["Browser_Bits"] == 32 ? "WOW64" : "Win64; x64");
			}
			
			return oscpu;
		} else if(this.browser["Platform"] === "macOS" || this.browser["Platform"] === "MacOSX") {
			let oscpu = "Intel Mac OS X";
			
			// Platform version
			if(this.browser["Platform_Version"]) {
				oscpu += " " + this.browser["Platform_Version"];
			}
			
			return oscpu;
		}
		
		return this.platform;
	}


	/**
	 * Returns the work "Gecko"
	 * 
	 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/NavigatorID/product
	 * 
	 * @returns {string}
	 */
	get product() {
		return "Gecko";
	}


	/**
	 * Returns some static value of the Gecko platform token
	 * 
	 * @returns {string | undefined}
	 */
	get productSub() {
		if(this.browser["Browser"] === "IE") {
			return undefined;
		} else if(this.browser["Browser"] === "Firefox") {
			return "20100101";
		} else {
			// Platform Token as used by WebKit and all its derivatives and lookalikes
			return "20030107";
		}
	}
	
	
	/**
	 * Returns an empty string (some platforms would return a company name instead through)
	 * 
	 * @returns {string}
	 */
	get vendor() {
		switch(this.browser["RenderingEngine_Name"]) {
			case "Blink":
				if(this.browser["Browser"] === "Opera") {
					return "Opera Software ASA";
				}
				return "Google Inc.";
			
			case "WebKit":
				return "Apple Computer, Inc.";
			
			default:
				return "";
		 }
	}
	
	
	/**
	 * Returns an empty string or undefined on Internet Explorer
	 * 
	 * @returns {string|undefined}
	 */
	get vendorSub() {
		if(this.browser["Browser"] === "IE") {
			return undefined;
		} else {
			return "";
		}
	}
}

return Object.freeze({
	UserAgentParser: UserAgentParser
});
})();
