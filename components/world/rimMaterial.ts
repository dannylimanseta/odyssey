import { Color } from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

type RimMaterial = Material & {
  onBeforeCompile?: (parameters: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;
  customProgramCacheKey?: () => string;
  userData: Record<string, unknown>;
};

/**
 * Soft Fresnel rim added just before opaque_fragment.
 * Uses the view-space `normal` (set up by `<normal_fragment_begin>` in all built-in
 * materials) and approximates N·V with the normal's Z component, so we do NOT depend
 * on `vViewPosition` — which Lambert's fragment does not declare.
 * Chains with any existing onBeforeCompile. Safe to call once per material.
 */
export function applyRimHighlight(material: RimMaterial, rimColor: Color, strength = 0.32) {
  if (material.userData.rimApplied) return;
  material.userData.rimApplied = true;

  const uniforms = {
    uRimColor: { value: rimColor.clone() },
    uRimStrength: { value: strength },
  };
  material.userData.rimUniforms = uniforms;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimNdotV = clamp( normalize( normal ).z, 0.0, 1.0 );
float rimTerm = pow( 1.0 - rimNdotV, 2.15 );
outgoingLight += uRimColor * rimTerm * uRimStrength;
#include <opaque_fragment>`,
    );
  };

  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => {
    const base = prevKey?.() ?? '';
    return `${base}_rim:${strength.toFixed(2)}_${rimColor.getHexString()}`;
  };
}
