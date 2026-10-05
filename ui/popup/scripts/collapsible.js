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


const __popup_collapsible = (() => {
"use strict";

// Check if browser supports the `clipPath: inset(…)` CSS value
//COMPAT: Firefox 53-
let supportsClipPathInset = true;
document.documentElement.style.clipPath = "inset(0 0 0 0)";
if(!document.documentElement.style.clipPath) {
	supportsClipPathInset = false;
}
document.documentElement.style.clipPath = null;


/**
 * Wrapper around {@see HTMLElement} for collapsing/uncollapsing the given
 * element to/from zero height without any visual glitches
 */
class CollapsibleElement {
	/**
	 * @param {HTMLElement} element
	 * @param {?((isVisible: Boolean) => any)} onVisibilityChangeCB
	 * @param {object}   options
	 * @param {boolean} [options.toBottom]
	 * @param {number}  [options.transitionTime]
	 */
	constructor(element, onVisibilityChangeCB = null, options = {}) {
		this.element = element;
		this.onVisibilityChangeCB = onVisibilityChangeCB;
		
		this.options = {
			toBottom:       typeof(options.toBottom)       !== "undefined" ? options.toBottom       : false,
			transitionTime: typeof(options.transitionTime) !== "undefined" ? options.transitionTime : 0.5,
		};
		
		// Force disable `toBottom` if the browser does not support `clipPath` fully
		//COMPAT: Firefox 53-
		if(this.options.toBottom && !supportsClipPathInset) {
			this.options.toBottom = false;
		}
		
		// Setting box-sizing to border-box (as done by extension.css)
		// completely fucks up the layout calculations while animating
		this.element.style.boxSizing = "content-box";
		
		this._height  = 0;
		this._ready   = false;
		this._handler = null;
	}
	
	_updateHeight() {
		if(!this.hidden && this.element.clientHeight > 0 && this._handler === null) {
			let style = window.getComputedStyle(this.element);
			let padding = parseInt(style.getPropertyValue("padding-top"));
			padding    += parseInt(style.getPropertyValue("padding-bottom"));
			
			this._height = this.element.clientHeight - padding;
		}
	}
	
	/**
	 * Is the element currently visible to the user?
	 */
	get hidden() {
		return (this.element.getAttribute("aria-hidden") === "true");
	}
	
	/**
	 * Convinence shortcut for uncollapsing if the element is collapsed and
	 * collapsing if the element is not collapsed
	 */
	toggle() {
		return this.show(this.hidden);
	}
	
	/**
	 * Ensure that the element will become visible soon
	 * 
	 * If {@see shown} is `false` the element will be hidden instead.
	 * 
	 * @param {Boolean} shown Whether the element should be shown or hidden
	 */
	show(shown=true) {
		if(!shown) {
			return this.hide();
		}
		
		this._updateHeight();
		if(!this.hidden) {
			return;
		}
		
		this.element.removeAttribute("aria-hidden");
		if(this._height > 0) {
			// Set element to last-known height first and wait for transition
			// to complete before going back to `height: auto;`
			this._handler = (() => {
				this.element.style.height = null;
				
				if(this._handler !== null) {
					this.element.removeEventListener("transitionend", this._handler);
					this._handler = null;
				}
			});
			this.element.addEventListener("transitionend", this._handler);
			this.element.style.height = `${this._height}px`;
			
			// Unset padding
			this.element.style.paddingTop    = null;
			this.element.style.paddingBottom = null;
		} else {
			this.element.style.height = null;
		}
		this.element.style.clipPath  = "inset(0 0 0 0)";
		this.element.style.marginTop = "0";
		
		if(typeof(this.onVisibilityChangeCB) === "function") {
			return this.onVisibilityChangeCB(true);
		}
	}
	
	
	/**
	 * Ensure that the element will be hidden soon
	 */
	hide() {
		this._updateHeight();
		if(this.hidden) {
			return;
		}
		
		// Prevent height reset at end of transition if the opening transition
		// is currently in progress
		if(this._handler !== null) {
			this.element.removeEventListener("transitionend", this._handler);
			this._handler = null;
		}
		
		// Mark element as hidden (for screen readers)
		this.element.setAttribute("aria-hidden", "true");
		
		// First lock element to its current height before changing the height
		// to zero to avoid issues with transitioning from `height: auto;`
		let doCollapseHandler = (() => {
			if(this.options.toBottom) {
				this.element.style.clipPath  = `inset(${this._height}px 0 0 0)`;
				this.element.style.marginTop = `-${this._height}px`;
			} else {
				this.element.style.height = "0px";
			}
		});
		if(this._ready) {
			if(this.options.toBottom) {
				this.element.style.clipPath  = "inset(0 0 0 0)";
				this.element.style.marginTop = "0";
			} else {
				this.element.style.height = `${this._height}px`;
			}
			window.setTimeout(doCollapseHandler, 0);
		} else {
			// …unless we haven't initialized yet, in that case we don't want any
			// transition to happen anyways
			doCollapseHandler();
		}
		
		// Force vertical padding to zero as well
		this.element.style.paddingTop    = "0px";
		this.element.style.paddingBottom = "0px";
		
		if(typeof(this.onVisibilityChangeCB) === "function") {
			return this.onVisibilityChangeCB(false);
		}
	}
	
	/**
	 * Mark the element as being ready to be transitioned
	 * 
	 * Call this after all content elements have been added.
	 * 
	 * If you want to start hidden, call {@see hide} before calling this to
	 * ensure that the element will *not* transistion away on startup.
	 */
	markReady() {
		this._updateHeight();
		if(this._ready) {
			return;
		}
		
		let func = (() => {
			this.element.style.overflowY = "hidden";
			
			// Enable transitions
			this.element.style.transition =
				["height", "padding", "clip-path", "margin-top"].map((propertyName) => {
					return `${this.options.transitionTime}s ${propertyName}`;
				}).join(", ");
			
			this._ready = true;
		});
		if(this.hidden) {
			// Add slight delay to ensure that the transition property and the
			// initial height are *not* applied at the same time
			setTimeout(func, 0);
		} else {
			func();
		}
	}
}


return Object.freeze({
	CollapsibleElement: CollapsibleElement,
});
})();