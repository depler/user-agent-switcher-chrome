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

declare namespace popup.randommode {
	/**
	 * Random User-Agent rotation configuration UI (class from the JS code)
	 */
	class RandomMode {
		constructor(DOMParent: HTMLElement, categories: popup.Categories,
		            callbacks: popup.randommode.Callbacks,
		            initialOptions?: object);
		
		enabled: boolean;
		selectedCategories: string[];
		intervalState: utils.config.OptionsRandomInterval;
	}
	
	
	/**
	 * Callback interface of agent list
	 */
	interface Callbacks {
		/**
		 * Called when random-mode is enabled or disabled
		 */
		onEnabledChanged(enabled: boolean, oldEnabled: boolean);
		
		/**
		 * Called when the list of allowed random-mode categories is updated
		 */
		onSelectedCategoriesChanged(selectedCategories:    string[],
		                            oldSelectedCategories: string[]);
		
		/**
		 * Called when the random-mode interval configuration is changed
		 */
		onIntervalStateChanged(intervalState:    utils.config.OptionsRandomInterval,
		                       oldIntervalState: utils.config.OptionsRandomInterval);
	}
}