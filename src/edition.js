// Which page this build is. build.mjs builds the source twice: the console (index.html) and the
// demos page (demos/index.html). The two pages do not link to each other.
/* global __DEMOS_ONLY__ */
export const DEMOS_ONLY = typeof __DEMOS_ONLY__ !== 'undefined' && __DEMOS_ONLY__;
export const APP_NAME = 'Network Insights and Analytics Hub';
