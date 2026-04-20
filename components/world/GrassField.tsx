import { useTexture } from '@react-three/drei/native';
import { useFrame, useThree } from '@react-three/fiber/native';
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

import { GROUND_CURVE_RADIUS, GROUND_SURFACE_Y, GROUND_WIDTH, TREE_RECYCLE_Z } from './constants';
import { palette } from './palette';
import { useWorldScrollRef } from './ScrollContext';

/** Blade count scales with lawn area (see GRASS_X_SPREAD_MUL). */
const GRASS_COUNT = 5000;
/** Plane width before instance scale; world width = this × scaleXZ. */
const BLADE_WIDTH = 0.05;
/** Sprite height in world units (width follows plane aspect). */
const BLADE_HEIGHT = 0.1;
/** Target world thickness (X) after scale: `BLADE_WIDTH * scaleXZ`. */
const GRASS_WIDTH_MIN = 0.04;
const GRASS_WIDTH_MAX = 0.05;
const GRASS_SCALE_XZ_MIN = GRASS_WIDTH_MIN / BLADE_WIDTH;
const GRASS_SCALE_XZ_MAX = GRASS_WIDTH_MAX / BLADE_WIDTH;
/**
 * Lateral half-width as a fraction of `GROUND_WIDTH` (mesh is centered; stay inside the quad).
 */
const GRASS_X_SPREAD_MUL = 0.47;
/** Sink blade bases slightly so sprites tuck into the turf (world Y). */
const GRASS_Y_SINK = 0.04;
/**
 * Local Z (ScrollingEnvironment space): near / far along the path.
 * Previously matched trees (~-31.5…3); grass is capped closer since fog hides the far band.
 */
const GRASS_LOCAL_Z_MAX = 0;
const GRASS_LOCAL_Z_MIN = -10;
/** Recycled blades respawn in a strip starting at this offset from `GRASS_LOCAL_Z_MIN + scroll`. */
const GRASS_RECYCLE_SPAWN_DEPTH = 4;

function hash(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function rnd(seed: number, lo: number, hi: number) {
  return lo + hash(seed) * (hi - lo);
}
function pickUniformXZ(seed: number, xSpread: number, zMin: number, zMax: number): { x: number; z: number } {
  return {
    x: rnd(seed * 2.47, -xSpread, xSpread),
    z: zMin + rnd(seed * 3.11, 0, zMax - zMin),
  };
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
  const { camera } = useThree();
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
        uCameraWorld: { value: new Vector3() },
        uWindDir: { value: new Vector3(1.0, 0.0, 0.0) },
        uWindAmp: { value: 0.02},
        uFogColor: { value: new Color(palette.fog) },
        uFogNear: { value: 6.0 },
        uFogFar: { value: 36.0 },
        uCurveRadius: { value: GROUND_CURVE_RADIUS },
        uBladeHeight: { value: BLADE_HEIGHT },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCameraWorld;
        uniform vec3 uWindDir;
        uniform float uWindAmp;
        uniform float uCurveRadius;
        uniform float uBladeHeight;

        varying vec2 vUv;
        varying float vViewZ;

        void main() {
          vUv = uv;

          // Instance matrix = translation + scale only (no CPU rotation). Yaw billboard here.
          vec3 baseInst = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          vec3 vertInst = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
          vec3 off = vertInst - baseInst;

          vec3 baseWorld = ( modelMatrix * vec4( baseInst, 1.0 ) ).xyz;
          float ang = atan( uCameraWorld.x - baseWorld.x, uCameraWorld.z - baseWorld.z );
          float co = cos( ang );
          float si = sin( ang );
          float rx = off.x * co + off.z * si;
          float rz = -off.x * si + off.z * co;
          vec3 instBillboard = baseInst + vec3( rx, off.y, rz );

          vec4 worldPos = modelMatrix * vec4( instBillboard, 1.0 );

          // Local blade height only (attribute position.y, not translated world Y).
          float h = clamp( position.y / uBladeHeight, 0.0, 1.0 );

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
    scaleXZ: new Float32Array(GRASS_COUNT),
    scaleY: new Float32Array(GRASS_COUNT),
    initialized: false,
  });

  const mat4 = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const scaleV = useMemo(() => new Vector3(), []);
  const identityQuat = useMemo(() => new Quaternion(), []);
  const camWorld = useMemo(() => new Vector3(), []);
  const uploadAllInstanceMatricesRef = useRef(true);

  const xSpread = GROUND_WIDTH * GRASS_X_SPREAD_MUL;

  const initLayout = () => {
    const st = state.current;
    if (st.initialized) return;
    st.initialized = true;
    for (let i = 0; i < GRASS_COUNT; i++) {
      const { x, z } = pickUniformXZ(i * 2.17 + 1.3, xSpread, GRASS_LOCAL_Z_MIN, GRASS_LOCAL_Z_MAX);
      st.x[i] = x;
      st.z[i] = z;
      st.scaleXZ[i] = rnd(i * 4.43 + 2.1, GRASS_SCALE_XZ_MIN, GRASS_SCALE_XZ_MAX);
      st.scaleY[i] = rnd(i * 5.87 + 3.2, 0.78, 1.45);
    }
  };

  const timeStartRef = useRef<number | null>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    initLayout();

    const mat = mesh.material as ShaderMaterial;
    if (timeStartRef.current === null) timeStartRef.current = performance.now();
    mat.uniforms.uTime.value = (performance.now() - timeStartRef.current) * 0.001;

    camera.getWorldPosition(camWorld);
    mat.uniforms.uCameraWorld.value.copy(camWorld);

    const scroll = scrollRef?.current ?? 0;
    const st = state.current;
    let instanceChanged = false;

    const writeMatrix = (i: number) => {
      pos.set(st.x[i]!, GROUND_SURFACE_Y - GRASS_Y_SINK, st.z[i]!);
      scaleV.set(st.scaleXZ[i]!, st.scaleY[i]!, st.scaleXZ[i]!);
      mat4.compose(pos, identityQuat, scaleV);
      mesh.setMatrixAt(i, mat4);
    };

    if (uploadAllInstanceMatricesRef.current) {
      for (let i = 0; i < GRASS_COUNT; i++) {
        writeMatrix(i);
      }
      uploadAllInstanceMatricesRef.current = false;
      instanceChanged = true;
    }

    for (let i = 0; i < GRASS_COUNT; i++) {
      if (-scroll + st.z[i]! > TREE_RECYCLE_Z) {
        const zLo = GRASS_LOCAL_Z_MIN + scroll;
        const zHi = zLo + GRASS_RECYCLE_SPAWN_DEPTH;
        const { x, z } = pickUniformXZ(scroll + i * 5.73, xSpread, zLo, zHi);
        st.x[i] = x;
        st.z[i] = z;
        st.scaleXZ[i] = rnd(scroll + i * 3.17 + 0.4, GRASS_SCALE_XZ_MIN, GRASS_SCALE_XZ_MAX);
        st.scaleY[i] = rnd(scroll + i * 2.71 + 0.9, 0.78, 1.45);
        writeMatrix(i);
        instanceChanged = true;
      }
    }

    if (instanceChanged) mesh.instanceMatrix.needsUpdate = true;
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
