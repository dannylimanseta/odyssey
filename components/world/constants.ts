/** World units per new pedometer step (tunable). */
export const STEP_TO_WORLD = 0.5;
/** Idle drift along the path when not stepping (units/sec). */
export const IDLE_SCROLL_SPEED = 0.38;
/** Scale idle down right after a step so walking feels step-driven. */
export const IDLE_DAMPING_AFTER_STEP = 0.28;
/** Horizontal ground quad — lateral (world X). */
export const GROUND_WIDTH = 16;
/** Horizontal ground quad — along the path (world Z, local). */
export const GROUND_DEPTH = 46;
/**
 * Legacy names kept with stable numbers so Metro/Expo hot-cache cannot pass
 * `undefined` into any old CircleGeometry construction (NaN thetaStart).
 */
export const GROUND_RADIUS = 38;
export const GROUND_THETA = 0.42;
/**
 * Large radius for Animal Crossing–style roll: y ≈ -z² / (2R) along the path.
 * Larger R = gentler curve.
 */
export const GROUND_CURVE_RADIUS = 92;
/** Base Y of the ground mesh inside the scrolling group (matches trees + bend). */
export const GROUND_SURFACE_Y = -0.34;

/**
 * Height of the rolling lawn at local Z (same math as the ground vertex shader).
 * Trees use this so trunks sit on the curved surface.
 */
export function groundBendY(localZ: number): number {
  return -(localZ * localZ) / (2 * GROUND_CURVE_RADIUS);
}

/** Recycle trees when this far past the camera (world Z). */
export const TREE_RECYCLE_Z = 4;
/** Respawn trees this far ahead (local -Z in env group). */
export const TREE_SPAWN_Z = -32;
export const TREE_COUNT = 18;
