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

declare namespace popup.agentlist {
	/**
	 * Dynamic list of selectable User-Agent entries (class from the JS code)
	 */
	class AgentList {
		constructor(DOMParent: HTMLElement, categories: popup.Categories,
		            callbacks: popup.agentlist.Callbacks,
		            initialOptions?: { userAgent?: string | null, collapsedCategories?: string[] });
		
		userAgent: string | null;
		collapsedCategories: string[];
	}
	
	
	
	/**
	 * Callback interface of agent list
	 */
	interface Callbacks {
		/**
		 * Called when a agent item was selected by the user
		 * 
		 * @param string    The User-Agent string of the newly selected item
		 * @param oldString The User-Agent string of the previously selected item
		 */
		onUserAgentChanged(string: string|null, oldString: string|null);
		
		/**
		 * Called when the user collapsed or uncollapsed a category entry
		 * 
		 * @param categories    The new list of collapsed categories
		 * @param oldCategories The previous list of collapsed categories
		 */
		onCollapsedCategoriesChanged(categories: string[], oldCategories: string[]);
	}
}