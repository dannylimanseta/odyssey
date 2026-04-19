import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import { Color, DoubleSide, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Mesh } from 'three';

import { GROUND_CURVE_RADIUS, GROUND_DEPTH, GROUND_SURFACE_Y, GROUND_WIDTH } from './constants';
import { applyGroundCurveBend } from './groundCurveMaterial';
import { palette } from './palette';

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

    const m = new MeshBasicMaterial({
      color: new Color(palette.ground),
      side: DoubleSide,
      depthTest: true,
    });
    applyGroundCurveBend(m, GROUND_CURVE_RADIUS);

    return { geometry: g, material: m };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const s = scrollRef?.current ?? 0;
    if (!mesh) return;
    mesh.position.set(0, GROUND_SURFACE_Y, s);
    syncGroundMeshUniform(mesh);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, GROUND_SURFACE_Y, 0]}
    />
  );
}

function syncGroundMeshUniform(mesh: Mesh) {
  const uniforms = (mesh.material as MeshBasicMaterial).userData.groundUniforms as
    | { uGroundMeshZ: { value: number } }
    | undefined;
  if (uniforms) uniforms.uGroundMeshZ.value = mesh.position.z;
}

export function GroundTintBand() {
  const meshRef = useRef<Mesh>(null);
  const scrollRef = useWorldScrollRef();

  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(GROUND_WIDTH * 0.88, GROUND_DEPTH * 0.92, Math.max(12, SUB_X - 6), Math.max(16, SUB_Z - 8));
    g.rotateX(-Math.PI / 2);
    const m = new MeshBasicMaterial({
      color: new Color(palette.groundEdge),
      transparent: true,
      opacity: 0.45,
      side: DoubleSide,
      depthWrite: false,
    });
    applyGroundCurveBend(m, GROUND_CURVE_RADIUS * 1.02);

    return { geometry: g, material: m };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const s = scrollRef?.current ?? 0;
    if (!mesh) return;
    mesh.position.set(0, GROUND_SURFACE_Y + 0.015, 0.02 + s);
    syncGroundMeshUniform(mesh);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, GROUND_SURFACE_Y + 0.015, 0.02]}
    />
  );
}
