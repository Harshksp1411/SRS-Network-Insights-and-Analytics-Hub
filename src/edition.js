// Which page this build is. build.mjs builds four pages (plus the OpsRamp view): the console (index.html), the demos (demos/index.html)
// and the real-time role-based dashboards (dashboards/index.html). The pages do not link to each other.
/* global __EDITION__ */
export const EDITION = typeof __EDITION__ !== 'undefined' ? __EDITION__ : 'console';
export const DEMOS_ONLY = EDITION === 'demos';
// the OpsRamp view (opsramp/index.html): the same live data, in the OpsRamp look, with alerts, insights, resources,
// patch and vulnerability, network performance dashboards and reporting apps
export const OPSRAMP = EDITION === 'opsramp';
export const APP_NAME = 'Network Insights and Analytics Hub';
