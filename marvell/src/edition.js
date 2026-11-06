// Which page this build is. build.mjs builds three pages: the console (index.html), the demos (demos/index.html)
// and the real-time role-based dashboards (dashboards/index.html). The pages do not link to each other.
/* global __EDITION__ */
export const EDITION = typeof __EDITION__ !== 'undefined' ? __EDITION__ : 'console';
export const DEMOS_ONLY = EDITION === 'demos';
export const APP_NAME = 'Network Insights and Analytics Hub';
