import { useMemo } from 'react';
import { ShaderMaterial } from 'three';

import { GROUND_SURFACE_Y } from './constants';

type BlobShadowProps = {
  /** Ellipse half-size along world X / Z (world units). */
  radiusX?: number;
  radiusZ?: number;
  /** 0..1 peak darkness at the center. */
  opacity?: number;
  /** Offset along +X / +Z from the owner's origin (bias toward sun-down direction). */
  offsetX?: number;
  offsetZ?: number;
  /** Extra lift above GROUND_SURFACE_Y to avoid z-fighting with the bent lawn. */
  lift?: number;
};

/**
 * Fallback "contact" shadow drawn as a soft black ellipse on top of the ground.
 *
 * Independent of the real shadow-map pass so it renders even when the GLTF hero
 * is culled from shadow casting, the material is transparent, or the shadow map
 * atlas is oversized. Uses a radial falloff in local UV space → cheap, crisp,
 * and always visible directly beneath the traveler.
 */
export function BlobShadow({
  radiusX = 0.18,
  radiusZ = 0.12,
  opacity = 0.28,
  offsetX = 0,
  offsetZ = 0,
  lift = 0.002,
}: BlobShadowProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uOpacity: { value: opacity },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform float uOpacity;
          void main() {
            vec2 c = vUv - 0.5;
            float d = length(c) * 2.0;
            // Gaussian-ish soft falloff, fully faded at the ellipse edge.
            float a = smoothstep(1.0, 0.0, d);
            a = pow(a, 1.6);
            gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
          }
        `,
      }),
    [opacity],
  );

  return (
    <mesh
      position={[offsetX, GROUND_SURFACE_Y + lift, offsetZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={1}
    >
      <planeGeometry args={[radiusX * 2, radiusZ * 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
