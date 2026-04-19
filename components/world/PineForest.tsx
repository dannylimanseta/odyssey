import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';

import {
  GROUND_CURVE_RADIUS,
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  groundBendY,
  TREE_COUNT,
  TREE_PATH_EXCLUSION_HALF_WIDTH,
  TREE_RECYCLE_Z,
  TREE_SINK_DEPTH,
  TREE_SPAWN_Z,
} from './constants';
import { applyDistanceDefocus } from './distanceDefocusMaterial';
import { palette } from './palette';
import { applyRimHighlight } from './rimMaterial';

import { useWorldScrollRef } from './ScrollContext';

/** Global scale vs original teardrop + trunk (bigger silhouettes). */
const TREE_SCALE = 1.48;

/** radiusTop, radiusBottom, height — shorter stem vs earlier builds. */
const trunkArgs = [0.1 * TREE_SCALE, 0.12 * TREE_SCALE, 0.34 * TREE_SCALE, 5] as [
  number,
  number,
  number,
  number,
];

const TRUNK_H = trunkArgs[2];
/** Cylinder Y-centered; trunk base on surface, foliage base on trunk top. */
const TRUNK_HALF = TRUNK_H * 0.5;

/** Base foliage footprint — variants scale from this. */
const TEARDROP_HEIGHT = 0.78 * TREE_SCALE;
const TEARDROP_MAX_R = 0.24 * TREE_SCALE;
const TEARDROP_LATHE_RADIAL = 12;

const SHAPE_VARIANTS = [
  /** Narrower, a bit taller — reads like a young spire. */
  { maxRMul: 0.9, heightMul: 1.06, power: 0.62, bulgeMul: 0.055, wobblePhase: 0.15 },
  /** Wider belly, shorter — rounder lump. */
  { maxRMul: 1.1, heightMul: 0.92, power: 0.72, bulgeMul: 0.068, wobblePhase: 0.55 },
  /** Balanced default-ish. */
  { maxRMul: 1.0, heightMul: 1.0, power: 0.68, bulgeMul: 0.06, wobblePhase: 0.28 },
  /** Taller, slimmer — column then bulb. */
  { maxRMul: 0.86, heightMul: 1.1, power: 0.58, bulgeMul: 0.052, wobblePhase: 0.72 },
] as const;

const NUM_SHAPE_VARIANTS = SHAPE_VARIANTS.length;

/**
 * Revolved teardrop profile; `variantIndex` picks silhouette family. Base wobble
 * is still a surface of revolution.
 */
function buildTeardropGeometry(variantIndex: number): { geometry: LatheGeometry; halfHeight: number } {
  const p = SHAPE_VARIANTS[variantIndex % NUM_SHAPE_VARIANTS]!;
  const maxR = TEARDROP_MAX_R * p.maxRMul;
  const height = TEARDROP_HEIGHT * p.heightMul;
  const profileSteps = 40;
  const tipR = maxR * 0.0015;
  const points: Vector2[] = [];
  const ph = p.wobblePhase;
  for (let i = 0; i <= profileSteps; i++) {
    const t = i / profileSteps;
    const y = t * height;
    const u = 1 - t;
    let r =
      maxR *
      Math.pow(Math.sin((u * Math.PI) / 2), p.power) *
      (1.0 + p.bulgeMul * Math.sin(Math.PI * u * 0.72));
    const irregularMask = Math.pow(1 - t, 1.35);
    const wobble =
      0.026 * Math.sin(i * 1.31 + 1.05 + ph) +
      0.018 * Math.sin(i * 2.84 - 0.5 + ph * 1.7) +
      0.012 * Math.sin(i * 4.6 + 0.9 + ph) +
      0.009 * Math.sin(u * Math.PI * 7.2 + ph);
    r *= 1 + irregularMask * wobble;
    r = Math.max(tipR, r);
    points.push(new Vector2(r, y));
  }
  const geometry = new LatheGeometry(points, TEARDROP_LATHE_RADIAL);
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const span = bbox.max.y - bbox.min.y;
  const cy = (bbox.min.y + bbox.max.y) / 2;
  geometry.translate(0, -cy, 0);
  return { geometry, halfHeight: span * 0.5 };
}

function randomInRange(seed: number, lo: number, hi: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return lo + (x - Math.floor(x)) * (hi - lo);
}

/**
 * Sample X on left or right of the path, leaving a clear strip for the player.
 */
function randomTreeX(seed: number, xSpread: number, exclusionHalfWidth: number) {
  const gap = Math.min(exclusionHalfWidth, xSpread * 0.92);
  const leftLo = -xSpread;
  const leftHi = -gap;
  const rightLo = gap;
  const rightHi = xSpread;
  const pick = randomInRange(seed * 1.93, 0, 1);
  if (pick < 0.5) {
    return randomInRange(seed * 2.47, leftLo, leftHi);
  }
  return randomInRange(seed * 4.11, rightLo, rightHi);
}

export function PineForest() {
  const scrollRef = useWorldScrollRef();
  const matCone = useMemo(() => {
    const m = new MeshLambertMaterial({
      color: new Color(palette.pine),
      /** Lathe is a thin shell; camera often sees the interior from below → need back faces. */
      side: DoubleSide,
    });
    applyDistanceDefocus(m, { hazeColor: new Color(palette.fog), near: 5, far: 34 });
    applyRimHighlight(m, new Color(palette.rim), 0.38);
    return m;
  }, []);
  const matTrunk = useMemo(() => {
    const m = new MeshLambertMaterial({
      color: new Color(palette.trunk),
    });
    applyDistanceDefocus(m, { hazeColor: new Color(palette.fog), near: 5, far: 34 });
    applyRimHighlight(m, new Color(palette.rim), 0.28);
    return m;
  }, []);

  const geomTrunk = useMemo(() => new CylinderGeometry(...trunkArgs), []);

  const {
    foliageVariants,
    variantByTree,
    slotByTree,
    foliageCounts,
    trunkYMuls,
    trunkRMuls,
    foliageScales,
  } = useMemo(() => {
    const foliageVariants = Array.from({ length: NUM_SHAPE_VARIANTS }, (_, v) => buildTeardropGeometry(v));
    const variantByTree = new Uint8Array(TREE_COUNT);
    const slotByTree = new Uint16Array(TREE_COUNT);
    const counts = new Array<number>(NUM_SHAPE_VARIANTS).fill(0);
    for (let i = 0; i < TREE_COUNT; i++) {
      const v = Math.min(
        NUM_SHAPE_VARIANTS - 1,
        Math.floor(randomInRange(i * 17.31 + 4.2, 0, NUM_SHAPE_VARIANTS)),
      );
      variantByTree[i] = v;
      slotByTree[i] = counts[v]!;
      counts[v] = counts[v]! + 1;
    }
    const trunkYMuls = new Float32Array(TREE_COUNT);
    const trunkRMuls = new Float32Array(TREE_COUNT);
    const foliageScales = new Float32Array(TREE_COUNT);
    for (let i = 0; i < TREE_COUNT; i++) {
      trunkYMuls[i] = 0.86 + randomInRange(i * 5.3 + 1.1, 0, 0.24);
      trunkRMuls[i] = 0.88 + randomInRange(i * 2.9 + 0.7, 0, 0.18);
      foliageScales[i] = 0.94 + randomInRange(i * 8.1 + 2.4, 0, 0.11);
    }
    return {
      foliageVariants,
      variantByTree,
      slotByTree,
      foliageCounts: counts,
      trunkYMuls,
      trunkRMuls,
      foliageScales,
    };
  }, []);

  const foliageRefs = useRef<(InstancedMesh | null)[]>([]);
  const trunks = useRef<InstancedMesh>(null);

  const state = useRef({
    x: new Float32Array(TREE_COUNT),
    z: new Float32Array(TREE_COUNT),
    initialized: false,
  });

  const m = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const quat = useMemo(() => new Quaternion(), []);
  const euler = useMemo(() => new Euler(), []);
  const trunkScale = useMemo(() => new Vector3(1, 1, 1), []);
  const foliageScale = useMemo(() => new Vector3(1, 1, 1), []);

  const xSpread = GROUND_WIDTH * 0.4;

  const initLayout = () => {
    const st = state.current;
    if (st.initialized) return;
    st.initialized = true;
    for (let i = 0; i < TREE_COUNT; i++) {
      st.x[i] = randomTreeX(i * 1.71, xSpread, TREE_PATH_EXCLUSION_HALF_WIDTH);
      st.z[i] = TREE_SPAWN_Z + randomInRange(i * 3.31, 2, 22);
    }
  };

  useFrame(() => {
    initLayout();
    const scroll = scrollRef?.current ?? 0;
    const st = state.current;
    const t = trunks.current;
    if (!t) return;

    for (let i = 0; i < TREE_COUNT; i++) {
      let zi = st.z[i];
      // Group is at z = -scroll (scroll negative), so world z = -scroll + zi.
      if (-scroll + zi > TREE_RECYCLE_Z) {
        st.x[i] = randomTreeX(scroll + i * 7.1, xSpread, TREE_PATH_EXCLUSION_HALF_WIDTH);
        const ahead = TREE_SPAWN_Z + randomInRange(scroll + i * 2.9, 0, 10);
        zi = ahead + scroll;
        st.z[i] = zi;
      }

      const x = st.x[i];
      const z = zi;
      /** Ground is world-anchored at z = 0 with bend −worldZ²/(2R); read Y from the tree's current world Z. */
      const treeWorldZ = -scroll + z;
      const bend = groundBendY(treeWorldZ);
      /** Sink the whole tree so trunk roots are buried and the silhouette reads as grounded. */
      const surfaceY = GROUND_SURFACE_Y + bend - TREE_SINK_DEPTH;

      /**
       * Tree's up axis tracks the ground normal along the curve so silhouettes
       * "lean" with the hill — slope dy/dz = -worldZ / R → tilt about X by
       * atan(worldZ / R). Flat at the crest (z=0), splaying outward with distance.
       */
      const tilt = Math.atan(treeWorldZ / GROUND_CURVE_RADIUS);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      euler.set(tilt, 0, 0);
      quat.setFromEuler(euler);

      const v = variantByTree[i]!;
      const slot = slotByTree[i]!;
      const teardropHalf = foliageVariants[v]!.halfHeight;
      const ty = trunkYMuls[i]!;
      const tr = trunkRMuls[i]!;
      const fs = foliageScales[i]!;

      const trunkCenterOffset = TRUNK_HALF * ty;
      const trunkHWorld = TRUNK_H * ty;
      const foliageCenterOffset = trunkHWorld + teardropHalf * fs;

      trunkScale.set(tr, ty, tr);
      pos.set(x, surfaceY + trunkCenterOffset * cosT, z + trunkCenterOffset * sinT);
      m.compose(pos, quat, trunkScale);
      t.setMatrixAt(i, m);

      foliageScale.set(fs, fs, fs);
      pos.set(x, surfaceY + foliageCenterOffset * cosT, z + foliageCenterOffset * sinT);
      m.compose(pos, quat, foliageScale);
      const foliageMesh = foliageRefs.current[v];
      if (foliageMesh) foliageMesh.setMatrixAt(slot, m);
    }

    t.instanceMatrix.needsUpdate = true;
    for (let v = 0; v < NUM_SHAPE_VARIANTS; v++) {
      const fm = foliageRefs.current[v];
      if (fm) fm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {foliageVariants.map((fv, v) =>
        (foliageCounts[v] ?? 0) > 0 ? (
          <instancedMesh
            key={v}
            ref={(el) => {
              foliageRefs.current[v] = el;
            }}
            args={[fv.geometry, matCone, foliageCounts[v]!]}
            frustumCulled={false}
            castShadow
            receiveShadow
          />
        ) : null,
      )}
      <instancedMesh
        ref={trunks}
        args={[geomTrunk, matTrunk, TREE_COUNT]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
    </group>
  );
}
