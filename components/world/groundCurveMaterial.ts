import type { MeshLambertMaterial } from 'three';

import { GROUND_CURVE_RADIUS } from './constants';

export type GroundCurveUniforms = {
  uCurveRadius: { value: number };
};

/**
 * Stable horizon parabola: y -= vertexWorldZ² / (2R) with the crest always under the camera.
 * The ground mesh stays world-anchored at z = 0 (see CurvedGround), so transformed.z
 * equals the vertex's world Z. No scroll input → hill does not drift as the player walks.
 * Chains with any prior onBeforeCompile (e.g. rim highlight).
 */
export function applyGroundCurveBend(material: MeshLambertMaterial, radius = GROUND_CURVE_RADIUS) {
  const uniforms: GroundCurveUniforms = {
    uCurveRadius: { value: radius },
  };
  material.userData.groundUniforms = uniforms;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uCurveRadius;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  float _bend = -( transformed.z * transformed.z ) / ( 2.0 * uCurveRadius );
  transformed.y += _bend;`,
    );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `groundCurveStatic:${radius.toFixed(2)}${prevKey ? `_${prevKey()}` : ''}`;
}
