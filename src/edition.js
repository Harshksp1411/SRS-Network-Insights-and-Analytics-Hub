// Which page this build is. build.mjs builds the source twice: the console (index.html) and the
// demos page (demos/index.html). The two pages link to each other with these relative paths, which
// work both on GitHub Pages and when the built files are opened from disk.
/* global __DEMOS_ONLY__ */
export const DEMOS_ONLY = typeof __DEMOS_ONLY__ !== 'undefined' && __DEMOS_ONLY__;
export const APP_NAME = 'Networks Insights and Analytics Hub';
export const FULL_NAME = `SRS ${APP_NAME}`;
export const CONSOLE_URL = '../index.html';
export const DEMOS_URL = 'demos/index.html';
