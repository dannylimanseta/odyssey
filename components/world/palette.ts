/** Pastel AC-style palette — shared across sky, fog, ground, props. */
export const palette = {
  skyTop: '#94b0e8',
  skyMid: '#d8e0f4',
  skyHorizon: '#f2e8f2',
  skyWarm: '#e8cfe0',
  hill: '#9db8a8',
  hillDark: '#7a9b8f',
  ground: '#88AB65',
  fog: '#cfd6ea',
  pine: '#6eb899',
  pineVariant: '#5aa88a',
  trunk: '#8b7355',
  /**
   * Shader grass — warmer yellow-green so blades read like sun-kissed turf and
   * the base blends into the lit ground instead of looking like a darker mat.
   */
  grassBase: '#c4d39f',
  grassTip: '#dae3b6',
} as const;
