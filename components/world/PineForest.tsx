import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
} from 'three';

import {
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  groundBendY,
  TREE_COUNT,
  TREE_PATH_EXCLUSION_HALF_WIDTH,
  TREE_RECYCLE_Z,
  TREE_SPAWN_Z,
} from './constants';
import { palette } from './palette';
import { applyRimHighlight } from './rimMaterial';

import { useWorldScrollRef } from './ScrollContext';

/** Global scale vs original teardrop cone + trunk (bigger silhouettes). */
const TREE_SCALE = 1.48;

/** Teardrop: narrow tip, wider base (low segments). */
const coneArgs = [0.32 * TREE_SCALE, 0.78 * TREE_SCALE, 5] as [number, number, number];
const trunkArgs = [0.1 * TREE_SCALE, 0.12 * TREE_SCALE, 0.48 * TREE_SCALE, 5] as [
  number,
  number,
  number,
  number,
];

const CONE_H = coneArgs[1];
const TRUNK_H = trunkArgs[2];
/** Cylinder / cone are Y-centered; trunk base on surface, cone base on trunk top. */
const TRUNK_HALF = TRUNK_H * 0.5;
const CONE_HALF = CONE_H * 0.5;

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
    });
    applyRimHighlight(m, new Color(palette.rim), 0.38);
    return m;
  }, []);
  const matTrunk = useMemo(() => {
    const m = new MeshLambertMaterial({
      color: new Color(palette.trunk),
    });
    applyRimHighlight(m, new Color(palette.rim), 0.28);
    return m;
  }, []);

  const geomCone = useMemo(() => new ConeGeometry(...coneArgs), []);
  const geomTrunk = useMemo(() => new CylinderGeometry(...trunkArgs), []);

  const cones = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);

  const state = useRef({
    x: new Float32Array(TREE_COUNT),
    z: new Float32Array(TREE_COUNT),
    initialized: false,
  });

  const m = useMemo(() => new Matrix4(), []);

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
    const c = cones.current;
    const t = trunks.current;
    if (!c || !t) return;

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
      const surfaceY = GROUND_SURFACE_Y + bend;
      /** Trunk base at surfaceY; cone base flush on trunk top (Three Y-up cylinders / cones). */
      const yTrunk = surfaceY + TRUNK_HALF;
      const yCone = yTrunk + TRUNK_HALF + CONE_HALF;

      m.identity();
      m.makeTranslation(x, yCone, z);
      c.setMatrixAt(i, m);

      m.identity();
      m.makeTranslation(x, yTrunk, z);
      t.setMatrixAt(i, m);
    }

    c.instanceMatrix.needsUpdate = true;
    t.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={cones}
        args={[geomCone, matCone, TREE_COUNT]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
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
