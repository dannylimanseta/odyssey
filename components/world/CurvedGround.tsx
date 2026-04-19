import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import { Color, DoubleSide, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { Mesh } from 'three';

import { GROUND_CURVE_RADIUS, GROUND_DEPTH, GROUND_SURFACE_Y, GROUND_WIDTH } from './constants';
import { applyGroundCurveBend } from './groundCurveMaterial';
import { palette } from './palette';
import { applyRimHighlight } from './rimMaterial';

import { useWorldScrollRef } from './ScrollContext';

const SUB_X = 28;
const SUB_Z = 44;

/**
 * Subdivided lawn with vertex bend −z²/(2R) for a gentle Animal Crossing–style roll.
 */
export function CurvedGround() {
  const meshRef = useRef<Mesh>(null);
  const scrollRef = useWorldScrollRef();

  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(GROUND_WIDTH, GROUND_DEPTH, SUB_X, SUB_Z);
    g.rotateX(-Math.PI / 2);

    const m = new MeshLambertMaterial({
      color: new Color(palette.ground),
      side: DoubleSide,
      depthTest: true,
    });
    applyGroundCurveBend(m, GROUND_CURVE_RADIUS);
    applyRimHighlight(m, new Color(palette.rim), 0.34);

    return { geometry: g, material: m };
  }, []);

  /** Keep the mesh anchored at world z = 0 by cancelling the scrolling group's z. */
  useFrame(() => {
    const mesh = meshRef.current;
    const s = scrollRef?.current ?? 0;
    if (!mesh) return;
    mesh.position.set(0, GROUND_SURFACE_Y, s);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, GROUND_SURFACE_Y, 0]}
      castShadow={false}
      receiveShadow
    />
  );
}
