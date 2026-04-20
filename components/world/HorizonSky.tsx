import { useMemo } from 'react';
import { Color, DoubleSide, PlaneGeometry, ShaderMaterial } from 'three';

import { palette } from './palette';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision mediump float;
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
varying vec2 vUv;
void main() {
  float t = vUv.y;
  vec3 c = mix(bottomColor, horizonColor, smoothstep(0.0, 0.42, t));
  c = mix(c, midColor, smoothstep(0.38, 0.68, t));
  c = mix(c, topColor, smoothstep(0.62, 1.0, t));
  /* Softer overlay: show distant bg at bottom; pastel band mid/upper only. */
  float a = smoothstep(0.06, 0.22, t) * (1.0 - smoothstep(0.52, 0.9, t)) * 0.52;
  gl_FragColor = vec4(c, a);
}
`;

/** Pastel gradient backdrop behind the scene (low poly: single quad). */
export function HorizonSky() {
  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(100, 44, 1, 1);
    const m = new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color(palette.skyTop) },
        midColor: { value: new Color(palette.skyMid) },
        horizonColor: { value: new Color(palette.skyHorizon) },
        bottomColor: { value: new Color(palette.skyWarm) },
      },
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    return { geometry: g, material: m };
  }, []);

  return (
    <mesh geometry={geometry} material={material} position={[0, 3.5, -32]} renderOrder={-100} />
  );
}
