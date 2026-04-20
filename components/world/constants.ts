/** World units per new pedometer step (tunable). */
export const STEP_TO_WORLD = 1.9;
/** Idle drift along the path when not stepping (units/sec). */
export const IDLE_SCROLL_SPEED = 0.76;
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
 * Animal Crossing–style roll: y ≈ -z² / (2R) along the path.
 * Smaller R = more dramatic fall-off toward the horizon.
 */
export const GROUND_CURVE_RADIUS = 38;
/**
 * Scene linear fog (`scene.fog`) and custom grass fog — shared distances so
 * distant props tint together. Lower `far` = full fog color sooner.
 */
export const SCENE_FOG_NEAR = 5;
export const SCENE_FOG_FAR = 26;
/** Base Y of the ground mesh inside the scrolling group (matches trees + bend). */
export const GROUND_SURFACE_Y = -0.34;
/**
 * Extra world Y above the curved surface so the GLB’s feet sit on the ground at scroll 0.
 * Traveler uses `GROUND_SURFACE_Y + groundBendY(scroll) + this` each frame.
 * Kept tiny — at the current DISPLAY_SCALE the previous 0.06 read as visible float.
 */
export const TRAVELER_FOOT_CLEARANCE = 0.0;

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
export const TREE_COUNT = 72;
/** Minimum center distance between tree billboards (XZ) to reduce overlap / z-fighting. */
export const TREE_MIN_SEPARATION = 1.55;
/**
 * Lateral half-width of the cleared strip along the path (world X).
 * Trees spawn only outside [-TREE_PATH_EXCLUSION_HALF_WIDTH, +…] so the traveler stays visible.
 */
export const TREE_PATH_EXCLUSION_HALF_WIDTH = 0.7;
/** How far the trunk base sinks below the curved surface (world units). */
export const TREE_SINK_DEPTH = 0.22;
