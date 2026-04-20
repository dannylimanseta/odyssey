import { useTexture } from '@react-three/drei/native';
import { useFrame } from '@react-three/fiber/native';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

import treeImg1 from '../../assets/sprites/tree_1.png';
import treeImg2 from '../../assets/sprites/tree_2.png';
import treeImg3 from '../../assets/sprites/tree_3.png';
import treeImg4 from '../../assets/sprites/tree_4.png';

import {
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  groundBendY,
  TREE_COUNT,
  TREE_PATH_EXCLUSION_HALF_WIDTH,
  TREE_RECYCLE_Z,
  TREE_SINK_DEPTH,
  TREE_SPAWN_Z,
} from './constants';

import { useWorldScrollRef } from './ScrollContext';

const TREE_SPRITE_MODULES = [treeImg1, treeImg2, treeImg3, treeImg4] as const;
const NUM_SPRITE_VARIANTS = TREE_SPRITE_MODULES.length;

const TREE_SCALE = 1.48;
const SPRITE_W = 1.25 * TREE_SCALE;
const SPRITE_H = 1.9 * TREE_SCALE;
/** Extra downward nudge so sprite bases sit slightly deeper into the lawn. */
const SPRITE_GROUND_SINK = 0.09;
/** Radians; tilt around local X after yaw (billboard wind lean). */
const TREE_SWAY_LEAN_AMP = 0.065;
const TREE_SWAY_ROLL_AMP = 0.026;

function randomInRange(seed: number, lo: number, hi: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return lo + (x - Math.floor(x)) * (hi - lo);
}

/** `onLeft`: even tree indices use left, odd use right so both path sides stay populated. */
function randomTreeX(seed: number, xSpread: number, exclusionHalfWidth: number, onLeft: boolean) {
  const gap = Math.min(exclusionHalfWidth, xSpread * 0.92);
  const leftLo = -xSpread;
  const leftHi = -gap;
  const rightLo = gap;
  const rightHi = xSpread;
  if (onLeft) {
    return randomInRange(seed * 2.47, leftLo, leftHi);
  }
  return randomInRange(seed * 4.11, rightLo, rightHi);
}

async function resolveSpriteUris(): Promise<string[]> {
  return Promise.all(
    TREE_SPRITE_MODULES.map(async (mod) => {
      const asset = Asset.fromModule(mod);
      await asset.downloadAsync();
      return asset.localUri ?? asset.uri;
    }),
  );
}

type InstancedProps = {
  uris: readonly string[];
};

/**
 * Runs inside `<Suspense>` — `useTexture` wires into R3F's loader and calls
 * `gl.initTexture`, which Expo GL needs or maps stay blank forever.
 */
function PineForestInstanced({ uris }: InstancedProps) {
  const scrollRef = useWorldScrollRef();
  /** Stable array identity so `useLoader` does not re-fetch every render. */
  const textureUrls = useMemo(() => [...uris], [uris]);
  const maps = useTexture(textureUrls) as Texture[];

  useLayoutEffect(() => {
    for (const tex of maps) {
      tex.colorSpace = SRGBColorSpace;
      /** Expo GL + PNGs: `true` matches screen-space V so tree tops read upward. */
      tex.flipY = true;
      tex.needsUpdate = true;
    }
  }, [maps]);

  const materials = useMemo(
    () =>
      maps.map(
        (map) =>
          new MeshBasicMaterial({
            map,
            color: new Color(0xffffff),
            transparent: true,
            alphaTest: 0.15,
            side: DoubleSide,
            fog: true,
            depthWrite: true,
          }),
      ),
    [maps],
  );

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(SPRITE_W, SPRITE_H);
    g.translate(0, SPRITE_H * 0.5, 0);
    return g;
  }, []);

  const { variantByTree, slotByTree, spriteCounts, scaleMuls } = useMemo(() => {
    const variantByTree = new Uint8Array(TREE_COUNT);
    const slotByTree = new Uint16Array(TREE_COUNT);
    const counts = new Array<number>(NUM_SPRITE_VARIANTS).fill(0);
    for (let i = 0; i < TREE_COUNT; i++) {
      const v = Math.min(
        NUM_SPRITE_VARIANTS - 1,
        Math.floor(randomInRange(i * 17.31 + 4.2, 0, NUM_SPRITE_VARIANTS)),
      );
      variantByTree[i] = v;
      slotByTree[i] = counts[v]!;
      counts[v] = counts[v]! + 1;
    }
    const scaleMuls = new Float32Array(TREE_COUNT);
    for (let i = 0; i < TREE_COUNT; i++) {
      scaleMuls[i] = 0.88 + randomInRange(i * 8.1 + 2.4, 0, 0.2);
    }
    return { variantByTree, slotByTree, spriteCounts: counts, scaleMuls };
  }, []);

  const spriteRefs = useRef<(InstancedMesh | null)[]>([]);

  const state = useRef({
    x: new Float32Array(TREE_COUNT),
    z: new Float32Array(TREE_COUNT),
    initialized: false,
  });

  const m = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const quat = useMemo(() => new Quaternion(), []);
  const swayQX = useMemo(() => new Quaternion(), []);
  const swayQZ = useMemo(() => new Quaternion(), []);
  const xAxis = useMemo(() => new Vector3(1, 0, 0), []);
  const yAxis = useMemo(() => new Vector3(0, 1, 0), []);
  const zAxis = useMemo(() => new Vector3(0, 0, 1), []);
  const scaleV = useMemo(() => new Vector3(1, 1, 1), []);

  const xSpread = GROUND_WIDTH * 0.4;

  const initLayout = () => {
    const st = state.current;
    if (st.initialized) return;
    st.initialized = true;
    for (let i = 0; i < TREE_COUNT; i++) {
      const onLeft = (i & 1) === 0;
      st.x[i] = randomTreeX(i * 1.71, xSpread, TREE_PATH_EXCLUSION_HALF_WIDTH, onLeft);
      st.z[i] = TREE_SPAWN_Z + randomInRange(i * 3.31, 2, 22);
    }
  };

  useFrame(({ camera }) => {
    initLayout();
    const scroll = scrollRef?.current ?? 0;
    const st = state.current;
    const t = performance.now() * 0.001;
    const camX = camera.position.x;
    const camZ = camera.position.z;

    for (let i = 0; i < TREE_COUNT; i++) {
      let zi = st.z[i];
      if (-scroll + zi > TREE_RECYCLE_Z) {
        const onLeft = (i & 1) === 0;
        st.x[i] = randomTreeX(scroll + i * 7.1, xSpread, TREE_PATH_EXCLUSION_HALF_WIDTH, onLeft);
        const ahead = TREE_SPAWN_Z + randomInRange(scroll + i * 2.9, 0, 10);
        zi = ahead + scroll;
        st.z[i] = zi;
      }

      const x = st.x[i];
      const z = zi;
      const treeWorldZ = -scroll + z;
      const bend = groundBendY(treeWorldZ);
      const surfaceY = GROUND_SURFACE_Y + bend - TREE_SINK_DEPTH * 0.35 - SPRITE_GROUND_SINK;

      const worldZ = z - scroll;
      const dx = camX - x;
      const dz = camZ - worldZ;
      const yaw = Math.atan2(dx, dz);

      const phase = i * 0.71 + x * 1.25 + z * 0.19;
      const lean =
        Math.sin(t * 1.22 + phase) * 0.55 * TREE_SWAY_LEAN_AMP +
        Math.sin(t * 2.35 + phase * 0.73) * 0.45 * TREE_SWAY_LEAN_AMP;
      const roll =
        Math.sin(t * 1.08 + phase * 1.15) * 0.65 * TREE_SWAY_ROLL_AMP +
        Math.sin(t * 2.1 - z * 0.4) * 0.45 * TREE_SWAY_ROLL_AMP;

      quat.setFromAxisAngle(yAxis, yaw);
      swayQX.setFromAxisAngle(xAxis, lean);
      quat.multiply(swayQX);
      swayQZ.setFromAxisAngle(zAxis, roll);
      quat.multiply(swayQZ);

      const sm = scaleMuls[i]!;
      scaleV.set(sm, sm, sm);

      pos.set(x, surfaceY, z);
      m.compose(pos, quat, scaleV);

      const v = variantByTree[i]!;
      const slot = slotByTree[i]!;
      const mesh = spriteRefs.current[v];
      if (mesh) mesh.setMatrixAt(slot, m);
    }

    for (let v = 0; v < NUM_SPRITE_VARIANTS; v++) {
      const sm = spriteRefs.current[v];
      if (sm) sm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {materials.map((mat, v) =>
        (spriteCounts[v] ?? 0) > 0 ? (
          <instancedMesh
            key={v}
            ref={(el) => {
              spriteRefs.current[v] = el;
            }}
            args={[geometry, mat, spriteCounts[v]!]}
            frustumCulled={false}
            castShadow={false}
            receiveShadow={false}
          />
        ) : null,
      )}
    </group>
  );
}

/**
 * 2D tree billboards (`tree_1`…`tree_4`). Asset URIs resolve outside Suspense;
 * actual GPU upload happens in `PineForestInstanced` via drei's `useTexture`.
 */
export function PineForest() {
  const [uris, setUris] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveSpriteUris()
      .then((u) => {
        if (!cancelled) setUris(u);
      })
      .catch(() => {
        if (!cancelled) setUris(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!uris || uris.length !== NUM_SPRITE_VARIANTS) return null;

  return (
    <Suspense fallback={null}>
      <PineForestInstanced uris={uris} />
    </Suspense>
  );
}
