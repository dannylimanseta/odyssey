import type { MeshBasicMaterial } from 'three';

import { GROUND_CURVE_RADIUS } from './constants';

export type GroundCurveUniforms = {
  uCurveRadius: { value: number };
  uGroundMeshZ: { value: number };
};

/**
 * Parabolic roll using group-local Z (vertex.z + mesh.position.z), so sliding the
 * ground mesh each frame keeps the hill shape aligned with tree groundBendY(zi).
 */
export function applyGroundCurveBend(material: MeshBasicMaterial, radius = GROUND_CURVE_RADIUS) {
  const uniforms: GroundCurveUniforms = {
    uCurveRadius: { value: radius },
    uGroundMeshZ: { value: 0 },
  };
  material.userData.groundUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uCurveRadius;
uniform float uGroundMeshZ;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  float gZ = transformed.z + uGroundMeshZ;
  float _bend = -( gZ * gZ ) / ( 2.0 * uCurveRadius );
  transformed.y += _bend;`,
    );
  };
  material.customProgramCacheKey = () => `groundCurveGZ:${radius.toFixed(2)}`;
}
