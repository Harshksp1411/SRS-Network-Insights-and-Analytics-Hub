// Live refresh speed shared by the live engine and the chart animations.
export const BASE_TICK = 2000;
export const SPEED = { x: 1, get tick() { return BASE_TICK / this.x; } };
export function setSpeedVar(x) {
  SPEED.x = x;
  try {
    const r = document.documentElement.style;
    r.setProperty('--tick', `${SPEED.tick}ms`);
    r.setProperty('--tickh', `${Math.round(SPEED.tick / 2)}ms`);
  } catch (e) { /* no DOM */ }
}
