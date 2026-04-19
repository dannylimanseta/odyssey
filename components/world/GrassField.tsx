import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';

import {
  GROUND_CURVE_RADIUS,
  GROUND_SURFACE_Y,
  GROUND_WIDTH,
  TREE_RECYCLE_Z,
  TREE_SPAWN_Z,
} from './constants';
import { palette } from './palette';
import { useWorldScrollRef } from './ScrollContext';

/** Ten-fold denser field — tuned with the base-alpha fade so overdraw is bounded. */
const GRASS_COUNT = 150000;
const BLADE_WIDTH = 0.05;
/** Half height — shorter stubbier blades read as turf, not meadow. */
const BLADE_HEIGHT = 0.07;
/** Narrow strip kept clear of blades so the path still reads. */
const GRASS_PATH_CLEAR_HALF = 0.26;

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

/**
 * Instanced shader grass. One draw call for all blades. Silhouette (rounded
 * base, pointy-but-rounded tip) is rendered via fragment alpha on a simple
 * plane so every blade corner reads as a curve, not a sharp rectangle edge.
 *
 * Design goals:
 *  - Base color matches the ground → blades dissolve into the lawn seamlessly.
 *  - Alpha at the bottom fades to 0 → no visible contact seam.
 *  - Wind sway is world-space coherent (gusts ripple across the field).
 *  - Recycle pattern mirrors `PineForest` for predictable density as you walk.
 */
export function GrassField() {
  const scrollRef = useWorldScrollRef();
  const meshRef = useRef<InstancedMesh>(null);

  const geometry = useMemo(() => {
    /**
     * Height-segmented plane so the shader can bend the blade smoothly.
     * Translated so the blade base sits at y = 0 (pivot on the ground).
     */
    const g = new PlaneGeometry(BLADE_WIDTH, BLADE_HEIGHT, 1, 4);
    g.translate(0, BLADE_HEIGHT * 0.5, 0);
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      /**
       * Keep depth writes so dense blades still resolve roughly front-to-back
       * against the ground + trees. Fragment shader discards low-alpha pixels
       * to avoid soft-edge z-fighting when many blades overlap.
       */
      depthWrite: true,
      depthTest: true,
      uniforms: {
        uTime: { value: 0 },
        /** Pure X-axis sway so blades lean left↔right from the camera's POV. */
        uWindDir: { value: new Vector3(1.0, 0.0, 0.0) },
        /** Stronger breeze — tips travel visibly further while bases stay glued. */
        uWindAmp: { value: 0.11 },
        uBaseColor: { value: new Color(palette.grassBase) },
        uTipColor: { value: new Color(palette.grassTip) },
        uHighlight: { value: new Color(palette.rim) },
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

        varying float vHeight;
        varying float vViewZ;
        varying vec2 vUv;

        void main() {
          vUv = uv;

          vec4 instPos = instanceMatrix * vec4( position, 1.0 );

          float h = clamp( instPos.y / uBladeHeight, 0.0, 1.0 );
          vHeight = h;

          vec4 worldPos = modelMatrix * instPos;

          // Tri-frequency wind sway, world-space coherent; larger primary swing.
          float phase = worldPos.x * 1.4 + worldPos.z * 0.9;
          float sway = sin( uTime * 1.55 + phase ) * 0.85
                     + sin( uTime * 2.70 + phase * 0.7 ) * 0.4
                     + sin( uTime * 0.75 + phase * 1.9 ) * 0.22;
          /** Slightly gentler height exponent → middle of the blade also moves, not just the tip. */
          float swayAmp = uWindAmp * pow( h, 1.2 );
          worldPos.xyz += uWindDir * sway * swayAmp;

          // Ground curve: parabolic horizon −z²/(2R) matches CurvedGround.
          worldPos.y += -( worldPos.z * worldPos.z ) / ( 2.0 * uCurveRadius );

          vec4 mv = viewMatrix * worldPos;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;

        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        uniform vec3 uHighlight;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;

        varying float vHeight;
        varying float vViewZ;
        varying vec2 vUv;

        void main() {
          float h = vUv.y;
          float cx = vUv.x - 0.5;

          // Blade silhouette as an alpha mask: widest at base, smoothly narrows
          // through a main taper, then a quarter-circle style cap that rounds
          // the tip so the top of each blade reads as a curve (zero slope at h=1).
          float mainTaper = 1.0 - pow( h, 1.15 );
          float tipCap = 1.0 - smoothstep( 0.62, 1.0, h );
          float width = 0.5 * mainTaper * tipCap;
          float dx = abs( cx );
          float sil = 1.0 - smoothstep( max( width - 0.035, 0.0 ), width + 0.002, dx );

          // Bottom of the blade fades to fully transparent so the base
          // dissolves into the ground instead of leaving a hard contact line.
          float bottomFade = smoothstep( 0.0, 0.24, h );

          float alpha = sil * bottomFade;
          if ( alpha < 0.03 ) discard;

          // Vertical color gradient. Base tracks the ground; tip a touch brighter.
          vec3 col = mix( uBaseColor, uTipColor, pow( h, 0.9 ) );
          col += uHighlight * 0.05 * pow( h, 6.0 );

          // Distance soften — match scene fog so far grass blends out.
          float t = smoothstep( uFogNear, uFogFar, vViewZ );
          float lum = dot( col, vec3( 0.299, 0.587, 0.114 ) );
          col = mix( col, vec3( lum ), t * 0.4 );
          col = mix( col, uFogColor, t * 0.55 );

          gl_FragColor = vec4( col, alpha );
        }
      `,
    });
    return m;
  }, []);

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

  const xSpread = GROUND_WIDTH * 0.5;

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
    const zRange = -TREE_SPAWN_Z + TREE_RECYCLE_Z - 1;
    for (let i = 0; i < GRASS_COUNT; i++) {
      st.x[i] = rndX(i * 2.17 + 1.3, xSpread, GRASS_PATH_CLEAR_HALF);
      st.z[i] = TREE_SPAWN_Z + rnd(i * 3.11 + 0.5, 0.5, zRange);
      st.rotY[i] = rnd(i * 7.19, 0, Math.PI);
      st.scaleXZ[i] = rnd(i * 4.43 + 2.1, 0.8, 1.3);
      st.scaleY[i] = rnd(i * 5.87 + 3.2, 0.85, 1.55);
      writeInstance(i, mesh);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  useFrame((_s, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    initLayout(mesh);

    /** Clamp dt so tab-switches don't teleport the phase. */
    const delta = Math.min(dt, 0.1);
    material.uniforms.uTime.value += delta;

    const scroll = scrollRef?.current ?? 0;
    const st = state.current;
    let recycled = 0;
    for (let i = 0; i < GRASS_COUNT; i++) {
      if (-scroll + st.z[i]! > TREE_RECYCLE_Z) {
        st.x[i] = rndX(scroll + i * 5.73, xSpread, GRASS_PATH_CLEAR_HALF);
        const ahead = TREE_SPAWN_Z + rnd(scroll + i * 1.91, 0, 8);
        st.z[i] = ahead + scroll;
        st.rotY[i] = rnd(scroll + i * 11.31, 0, Math.PI);
        st.scaleXZ[i] = rnd(scroll + i * 3.17 + 0.4, 0.8, 1.3);
        st.scaleY[i] = rnd(scroll + i * 2.71 + 0.9, 0.85, 1.55);
        writeInstance(i, mesh);
        recycled++;
      }
    }
    if (recycled > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, GRASS_COUNT]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
