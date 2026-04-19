import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
} from 'three';

import {
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  groundBendY,
  TREE_COUNT,
  TREE_RECYCLE_Z,
  TREE_SPAWN_Z,
} from './constants';
import { palette } from './palette';

import { useWorldScrollRef } from './ScrollContext';

/** Teardrop: narrow tip, wider base (low segments). */
const coneArgs = [0.32, 0.78, 5] as [number, number, number];
const trunkArgs = [0.1, 0.12, 0.48, 5] as [number, number, number, number];

function randomInRange(seed: number, lo: number, hi: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return lo + (x - Math.floor(x)) * (hi - lo);
}

export function PineForest() {
  const scrollRef = useWorldScrollRef();
  const matCone = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(palette.pine),
      }),
    [],
  );
  const matTrunk = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(palette.trunk),
      }),
    [],
  );

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
      st.x[i] = randomInRange(i * 1.71, -xSpread, xSpread);
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
      const worldZ = -scroll + zi;
      if (worldZ > TREE_RECYCLE_Z) {
        st.x[i] = randomInRange(scroll + i * 7.1, -xSpread, xSpread);
        const ahead = TREE_SPAWN_Z + randomInRange(scroll + i * 2.9, 0, 10);
        zi = ahead + scroll;
        st.z[i] = zi;
      }

      const x = st.x[i];
      const z = st.z[i];
      const bend = groundBendY(z);
      const yCone = GROUND_SURFACE_Y + bend + 0.7;
      const yTrunk = GROUND_SURFACE_Y + bend + 0.28;

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
      />
      <instancedMesh
        ref={trunks}
        args={[geomTrunk, matTrunk, TREE_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}
