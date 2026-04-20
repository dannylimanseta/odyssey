import { useTexture } from '@react-three/drei/native';
import { useFrame } from '@react-three/fiber/native';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import type { PerspectiveCamera } from 'three';

import bgImg from '../../assets/sprites/bg_1.png';

/** PNG pixel aspect width / height (`bg_1.png`); keeps image from stretching on the quad. */
const BG_TEX_ASPECT = 876 / 909;
/** Distance along view ray; plane is sized to cover the frustum at this depth. */
const BG_DIST = 72;
/** Extra scale so the quad always clears the view (lookAt / safe area slack). */
const BG_OVERSCAN = 0.7;
/**
 * Multiplies the map (1 = unchanged). Use slightly below 1 only if the backdrop still reads hotter than the lit scene.
 */
const BG_COLOR_GAIN = 1.0;
/** Luminance-preserving saturation; 1 = original, &gt;1 richer color (see `onBeforeCompile` below). */
const BG_SATURATION = 1.35;

async function resolveBgUri(): Promise<string> {
  const asset = Asset.fromModule(bgImg);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

type WithMapProps = { uri: string };

/**
 * Camera-facing plane with **cover** sizing so texture aspect is preserved (no horizontal squash).
 * Transparent pass + **`depthTest: true`** so the quad respects the depth buffer and does not paint
 * over the ground or character (`depthTest: false` would draw on top of all opaques).
 */
function DistantBgWithMap({ uri }: WithMapProps) {
  const meshRef = useRef<Mesh>(null);
  const dir = useMemo(() => new Vector3(), []);

  const textureUrls = useMemo(() => [uri], [uri]);
  const [map] = useTexture(textureUrls) as [Texture];

  useLayoutEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.format = RGBAFormat;
    map.flipY = true;
    map.premultiplyAlpha = false;
    map.needsUpdate = true;
  }, [map]);

  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(1, 1, 1, 1);
    const m = new MeshBasicMaterial({
      map,
      color: new Color(BG_COLOR_GAIN, BG_COLOR_GAIN, BG_COLOR_GAIN),
      side: DoubleSide,
      fog: false,
      /** Without this, alpha is ignored and transparent PNG pixels show as black. */
      transparent: true,
      /** Same tone mapping as the rest of the frame — `false` looks flat/dull vs shaded meshes. */
      toneMapped: true,
      depthWrite: false,
      depthTest: true,
    });

    m.customProgramCacheKey = () => `distantBg_sat_${BG_SATURATION.toFixed(2)}`;

    m.onBeforeCompile = (shader) => {
      shader.uniforms.uSaturation = { value: BG_SATURATION };
      const fs = shader.fragmentShader;
      const p = fs.indexOf('precision');
      const head =
        p >= 0 ? fs.slice(0, fs.indexOf('\n', p) + 1) + 'uniform float uSaturation;\n' + fs.slice(fs.indexOf('\n', p) + 1) : `uniform float uSaturation;\n${fs}`;
      shader.fragmentShader = head.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  diffuseColor.rgb = mix( vec3( l ), diffuseColor.rgb, uSaturation );
}
`,
      );
    };

    return { geometry: g, material: m };
  }, [map]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { camera, viewport } = state;

    camera.getWorldDirection(dir);
    mesh.position.copy(camera.position).addScaledVector(dir, BG_DIST);
    mesh.lookAt(camera.position);

    // RN / duplicate-three builds can break `instanceof PerspectiveCamera` → use duck-typed fields.
    const pcam = camera as PerspectiveCamera;
    const fov = typeof pcam.fov === 'number' && !Number.isNaN(pcam.fov) ? pcam.fov : 42;
    const aspect =
      typeof pcam.aspect === 'number' && pcam.aspect > 0
        ? pcam.aspect
        : viewport.aspect > 0
          ? viewport.aspect
          : 9 / 16;

    const vFov = (fov * Math.PI) / 180;
    const halfH = Math.tan(vFov / 2) * BG_DIST;
    const halfW = halfH * aspect;
    const visH = 2 * halfH;
    const visW = 2 * halfW;

    let planeW = visW;
    let planeH = visW / BG_TEX_ASPECT;
    if (planeH < visH) {
      planeH = visH;
      planeW = visH * BG_TEX_ASPECT;
    }

    const s = BG_OVERSCAN;
    mesh.scale.set(planeW * s, planeH * s, 1);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={-400} frustumCulled={false} />;
}

/**
 * Distant sky / land art (`bg_1.png`) — aspect-correct, follows the camera.
 */
export function DistantBgSky() {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveBgUri()
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
      <DistantBgWithMap uri={uri} />
    </Suspense>
  );
}
