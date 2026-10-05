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

declare namespace popup.collapsible {
	/**
	 * Collapse/expand helper (class from the JS code)
	 */
	class CollapsibleElement {
		constructor(element: HTMLElement,
		            onVisibilityChangeCB?: ((isVisible: boolean) => any) | null,
		            options?: { toBottom?: boolean, transitionTime?: number });
		
		show(shown?: boolean): any;
		hide(): any;
		toggle(): any;
		markReady(): void;
		readonly hidden: boolean;
	}
}