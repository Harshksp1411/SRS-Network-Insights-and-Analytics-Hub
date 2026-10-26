// Which page this build is. build.mjs builds the source twice: the console (index.html) and the
// demos page (demos/index.html). The console never mentions the demos; the demos page links to the
// console with this relative path, which works both on GitHub Pages and from disk.
/* global __DEMOS_ONLY__ */
export const DEMOS_ONLY = typeof __DEMOS_ONLY__ !== 'undefined' && __DEMOS_ONLY__;
export const APP_NAME = 'Networks Insights and Analytics Hub';
export const CONSOLE_URL = '../index.html';
