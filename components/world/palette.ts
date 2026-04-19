/** Pastel AC-style palette — shared across sky, fog, ground, props. */
export const palette = {
  skyTop: '#8ec5f2',
  skyMid: '#d4e8f7',
  skyHorizon: '#fde8dc',
  skyWarm: '#f5c9d4',
  hill: '#9db8a8',
  hillDark: '#7a9b8f',
  ground: '#00B052',
  fog: '#c8dde8',
  pine: '#6eb899',
  pineVariant: '#5aa88a',
  trunk: '#8b7355',
  /**
   * Shader grass — warmer yellow-green so blades read like sun-kissed turf and
   * the base blends into the lit ground instead of looking like a darker mat.
   */
  grassBase: '#c4d39f',
  grassTip: '#dae3b6',
  /** Warm yellow rim on lit edges (Lambert / Standard patch). */
  rim: '#ffd080',
} as const;
