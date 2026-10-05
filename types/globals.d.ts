/*
 * User Agent Switcher (Chrome port)
 *
 * Global type shims required by the shared (Firefox-originated) code when it
 * is type-checked outside of Firefox, plus the Chrome-only globals that the
 * Manifest V3 background/services rely on.
 */

/**
 * The add-on builds its `utils` and `popup` namespaces by probing for these
 * globals at runtime. They are declared here so the type-checker knows about
 * them; the actual namespaces with the rich types live in the `.d.ts` files
 * next to the source.
 */
declare const __utils_config: any;
declare const __utils_matchingengine: {
	MatchingEngine: new (topic: string, cache?: object | null) => utils.matchingengine.MatchingEngine;
	MatchingPattern: new (options: { hostname: string, protocol: string, port?: string | number | null, isWildcard?: boolean }) => utils.matchingengine.MatchingPattern;
	URLUtils: any;
};
declare const __utils_uaparser: any;

declare const __popup_collapsible: any;
declare const __popup_agentlist: any;
declare const __popup_override: any;
declare const __popup_randommode: any;

/**
 * COMPAT: `console.exception` is a Firefox-only convenience alias for
 * `console.error`. It is shimmed at runtime in `utils/polyfill.js`.
 */
interface Console {
	exception(...data: any[]): void;
}

/**
 * Firefox's API documentation uses `NodeSelector` (it is part of the DOM
 * specification draft) but the TypeScript DOM lib does not declare it.
 */
type NodeSelector = Element | Document | DocumentFragment;

/**
 * Marker set by `content/navigator-override.js` to avoid patching the same
 * document more than once.
 */
interface Window {
	pageHasOverride?: boolean;
}
