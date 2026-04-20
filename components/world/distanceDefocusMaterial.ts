import { Color } from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';

type PatchableMaterial = Material & {
  onBeforeCompile?: (parameters: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;
  customProgramCacheKey?: () => string;
  userData: Record<string, unknown>;
};

export type DistanceDefocusOptions = {
  /** View-space distance where soften begins (world-ish units via Three view length). */
  near?: number;
  /** View-space distance where soften reaches full strength. */
  far?: number;
  /** 0..1 scales how strong the effect is. */
  strength?: number;
  /** Mix toward this color for atmospheric haze (match scene fog). */
  hazeColor?: Color;
  /** Extra desaturation at distance (0..1). */
  desaturate?: number;
  /** Screen-space noise amplitude for a “soft focus” break-up (0..0.1). */
  noise?: number;
};

/**
 * Per-material depth soften: distance-based desaturation, light haze tint, and a
 * tiny high-frequency hash so far silhouettes read softer without a full-screen
 * blur pass (mobile-friendly). Runs before `#include <opaque_fragment>` so it
 * composes with scene fog in `fog_fragment`.
 */
export function applyDistanceDefocus(
  material: PatchableMaterial,
  {
    near = 5.5,
    far = 34,
    strength = 0.72,
    hazeColor,
    desaturate = 0.52,
    noise = 0.032,
  }: DistanceDefocusOptions = {},
) {
  if (material.userData.distanceDefocusApplied) return;
  material.userData.distanceDefocusApplied = true;

  const haze = hazeColor?.clone() ?? new Color(0xc8dde8);

  const uniforms = {
    uDofNear: { value: near },
    uDofFar: { value: far },
    uDofStrength: { value: strength },
    uDofHazeColor: { value: haze },
    uDofDesaturate: { value: desaturate },
    uDofNoise: { value: noise },
  };
  material.userData.distanceDefocusUniforms = uniforms;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float uDofNear;
uniform float uDofFar;
uniform float uDofStrength;
uniform vec3 uDofHazeColor;
uniform float uDofDesaturate;
uniform float uDofNoise;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
  float _vd = length( vViewPosition );
  float _t = smoothstep( uDofNear, uDofFar, _vd ) * uDofStrength;
  vec3 _lum = vec3( dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) ) );
  outgoingLight = mix( outgoingLight, _lum, _t * uDofDesaturate );
  outgoingLight = mix( outgoingLight, uDofHazeColor, _t * 0.38 );
  float _hn = fract( sin( dot( gl_FragCoord.xy + vec2( _vd, _vd * 0.37 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  outgoingLight += ( _hn - 0.5 ) * _t * uDofNoise;
}
#include <opaque_fragment>`,
    );
  };

  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => {
    const base = prevKey?.() ?? '';
    return `${base}_dof:${near.toFixed(1)}_${far.toFixed(1)}_${strength.toFixed(2)}_${haze.getHexString()}`;
  };
}
