import { useTexture } from '@react-three/drei/native';
import { useFrame } from '@react-three/fiber/native';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

import grassImg from '../../assets/sprites/grass_1.png';

import {
  GROUND_CURVE_RADIUS,
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  TREE_RECYCLE_Z,
  TREE_SPAWN_Z,
} from './constants';
import { palette } from './palette';
import { useWorldScrollRef } from './ScrollContext';

/** Fewer blades + patch mask → clumpy turf, not a solid carpet. */
const GRASS_COUNT = 6000;
const BLADE_WIDTH = 0.05;
/** Sprite height in world units (width follows plane aspect). */
const BLADE_HEIGHT = 0.1;
/** Narrow strip kept clear of blades so the path still reads. */
const GRASS_PATH_CLEAR_HALF = 0.0;
const GRASS_X_SPREAD_MUL = 0.1;
const PATCH_ACCEPT = 0.44;
const PATCH_ATTEMPTS = 14;

function hash(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function rnd(seed: number, lo: number, hi: number) {
  return lo + hash(seed) * (hi - lo);
}
function rndX(seed: number, xSpread: number, clearHalf: number) {
  const gap = Math.min(clearHalf, xSpread * 0.98);
  const pick = hash(seed * 1.93);
  if (pick < 0.5) return rnd(seed * 2.47, -xSpread, -gap);
  return rnd(seed * 4.11, gap, xSpread);
}

function patchMask(worldX: number, worldZ: number): number {
  const n1 = 0.5 + 0.5 * Math.sin(worldX * 1.05 + worldZ * 0.38);
  const n2 = 0.5 + 0.5 * Math.sin(worldX * 0.39 - worldZ * 0.71);
  const n3 = 0.5 + 0.5 * Math.cos(worldX * 0.21 + worldZ * 0.27);
  return n1 * n2 * 0.52 + n3 * 0.48;
}

function pickPatchyXZ(
  seed: number,
  scroll: number,
  xSpread: number,
  zMin: number,
  zMax: number,
): { x: number; z: number } {
  let bestX = 0;
  let bestZ = zMin;
  let bestScore = -1;
  for (let t = 0; t < PATCH_ATTEMPTS; t++) {
    const s = seed + t * 31.71;
    const x = rndX(s, xSpread, GRASS_PATH_CLEAR_HALF);
    const z = zMin + rnd(s * 2.13 + t, 0, zMax - zMin);
    const worldZ = z - scroll;
    const score = patchMask(x, worldZ);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestZ = z;
    }
    if (score >= PATCH_ACCEPT) return { x, z };
  }
  return { x: bestX, z: bestZ };
}

async function resolveGrassUri(): Promise<string> {
  const asset = Asset.fromModule(grassImg);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

type GrassFieldWithMapProps = { uri: string };

/**
 * Textured grass blade (`grass_1.png`): same instancing, wind, and ground curve;
 * fragment samples the sprite instead of a procedural silhouette.
 */
function GrassFieldWithMap({ uri }: GrassFieldWithMapProps) {
  const scrollRef = useWorldScrollRef();
  const meshRef = useRef<InstancedMesh>(null);

  const textureUrls = useMemo(() => [uri], [uri]);
  const [grassMap] = useTexture(textureUrls) as [Texture];

  useLayoutEffect(() => {
    grassMap.colorSpace = SRGBColorSpace;
    grassMap.flipY = true;
    grassMap.needsUpdate = true;
  }, [grassMap]);

  const geometry = useMemo(() => {
    const g = new PlaneGeometry(BLADE_WIDTH, BLADE_HEIGHT, 1, 4);
    g.translate(0, BLADE_HEIGHT * 0.5, 0);
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      uniforms: {
        uMap: { value: grassMap },
        uTime: { value: 0 },
        uWindDir: { value: new Vector3(1.0, 0.0, 0.0) },
        uWindAmp: { value: 0.2 },
        uFogColor: { value: new Color(palette.fog) },
        uFogNear: { value: 6.0 },
        uFogFar: { value: 36.0 },
        uCurveRadius: { value: GROUND_CURVE_RADIUS },
        uBladeHeight: { value: BLADE_HEIGHT },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uWindDir;
        uniform float uWindAmp;
        uniform float uCurveRadius;
        uniform float uBladeHeight;

        varying vec2 vUv;
        varying float vViewZ;

        void main() {
          vUv = uv;

          vec4 instPos = instanceMatrix * vec4( position, 1.0 );

          float h = clamp( instPos.y / uBladeHeight, 0.0, 1.0 );

          vec4 worldPos = modelMatrix * instPos;

          float phase = worldPos.x * 1.4 + worldPos.z * 0.9;
          float gust = sin( uTime * 1.55 + phase ) * 0.72
                     + sin( uTime * 2.70 + phase * 0.7 ) * 0.38
                     + sin( uTime * 0.75 + phase * 1.9 ) * 0.2;
          float flutter = sin( uTime * 3.4 + phase * 2.1 + worldPos.x * 3.2 ) * 0.35;
          vec3 windN = normalize( uWindDir );
          vec3 crossWind = normalize( cross( vec3( 0.0, 1.0, 0.0 ), windN ) );
          float swayXZ = gust + flutter;
          float swayCross = sin( uTime * 1.9 + phase * 1.15 ) * 0.55
                          + sin( uTime * 2.8 - phase * 0.85 ) * 0.28;
          float swayAmp = uWindAmp * pow( h, 1.65 );
          worldPos.xyz += ( windN * swayXZ + crossWind * swayCross ) * swayAmp;

          worldPos.y += -( worldPos.z * worldPos.z ) / ( 2.0 * uCurveRadius );

          vec4 mv = viewMatrix * worldPos;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;

        uniform sampler2D uMap;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying vec2 vUv;
        varying float vViewZ;

        void main() {
          vec4 tex = texture2D( uMap, vUv );

          float bottomFade = smoothstep( 0.0, 0.22, vUv.y );
          float alpha = tex.a * bottomFade;
          if ( alpha < 0.03 ) discard;

          vec3 col = tex.rgb;

          float t = smoothstep( uFogNear, uFogFar, vViewZ );
          float lum = dot( col, vec3( 0.299, 0.587, 0.114 ) );
          col = mix( col, vec3( lum ), t * 0.4 );
          col = mix( col, uFogColor, t * 0.55 );

          gl_FragColor = vec4( col, alpha );
        }
      `,
    });
    return m;
  }, [grassMap]);

  const state = useRef({
    x: new Float32Array(GRASS_COUNT),
    z: new Float32Array(GRASS_COUNT),
    rotY: new Float32Array(GRASS_COUNT),
    scaleXZ: new Float32Array(GRASS_COUNT),
    scaleY: new Float32Array(GRASS_COUNT),
    initialized: false,
  });

  const mat4 = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const quat = useMemo(() => new Quaternion(), []);
  const scaleV = useMemo(() => new Vector3(), []);
  const yAxis = useMemo(() => new Vector3(0, 1, 0), []);

  const xSpread = GROUND_WIDTH * GRASS_X_SPREAD_MUL;

  const writeInstance = (i: number, mesh: InstancedMesh) => {
    const st = state.current;
    pos.set(st.x[i]!, GROUND_SURFACE_Y, st.z[i]!);
    quat.setFromAxisAngle(yAxis, st.rotY[i]!);
    scaleV.set(st.scaleXZ[i]!, st.scaleY[i]!, st.scaleXZ[i]!);
    mat4.compose(pos, quat, scaleV);
    mesh.setMatrixAt(i, mat4);
  };

  const initLayout = (mesh: InstancedMesh) => {
    const st = state.current;
    if (st.initialized) return;
    st.initialized = true;
    const zSpan = -TREE_SPAWN_Z + TREE_RECYCLE_Z - 1;
    const zMin = TREE_SPAWN_Z + 0.5;
    const zMax = TREE_SPAWN_Z + zSpan;
    for (let i = 0; i < GRASS_COUNT; i++) {
      const { x, z } = pickPatchyXZ(i * 2.17 + 1.3, 0, xSpread, zMin, zMax);
      st.x[i] = x;
      st.z[i] = z;
      st.rotY[i] = rnd(i * 7.19, 0, Math.PI);
      st.scaleXZ[i] = rnd(i * 4.43 + 2.1, 0.72, 1.22);
      st.scaleY[i] = rnd(i * 5.87 + 3.2, 0.78, 1.45);
      writeInstance(i, mesh);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  useFrame((_s, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    initLayout(mesh);

    const delta = Math.min(dt, 0.1);
    material.uniforms.uTime.value += delta;

    const scroll = scrollRef?.current ?? 0;
    const st = state.current;
    let recycled = 0;
    for (let i = 0; i < GRASS_COUNT; i++) {
      if (-scroll + st.z[i]! > TREE_RECYCLE_Z) {
        const zLo = TREE_SPAWN_Z + scroll;
        const zHi = zLo + 10;
        const { x, z } = pickPatchyXZ(scroll + i * 5.73, scroll, xSpread, zLo, zHi);
        st.x[i] = x;
        st.z[i] = z;
        st.rotY[i] = rnd(scroll + i * 11.31, 0, Math.PI);
        st.scaleXZ[i] = rnd(scroll + i * 3.17 + 0.4, 0.72, 1.22);
        st.scaleY[i] = rnd(scroll + i * 2.71 + 0.9, 0.78, 1.45);
        writeInstance(i, mesh);
        recycled++;
      }
    }
    if (recycled > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={grassMap.uuid}
      ref={meshRef}
      args={[geometry, material, GRASS_COUNT]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

export function GrassField() {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveGrassUri()
      .then((u) => {
        if (!cancelled) setUri(u);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!uri) return null;

  return (
    <Suspense fallback={null}>
      <GrassFieldWithMap uri={uri} />
    </Suspense>
  );
}
