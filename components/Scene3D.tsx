import { useGLTF, useAnimations } from '@react-three/drei/native';
import { Canvas } from '@react-three/fiber/native';
import { Asset } from 'expo-asset';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  Color,
  DirectionalLight,
  Fog,
  LoopRepeat,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
} from 'three';
import type { AnimationClip, Group } from 'three';

import travelerModel from '../assets/models/traveler_1.glb';
import { BlobShadow } from './world/BlobShadow';
import { CurvedGround } from './world/CurvedGround';
import { HorizonSky } from './world/HorizonSky';
import { palette } from './world/palette';
import { PineForest } from './world/PineForest';
import { applyRimHighlight } from './world/rimMaterial';
import { ScrollingEnvironment, WorldScrollRoot } from './world/ScrollingEnvironment';
import { GROUND_SURFACE_Y, TRAVELER_FOOT_CLEARANCE } from './world/constants';

/** Hero scale. Kept intentionally small so more of the path/sky reads in frame. */
const DISPLAY_SCALE = 1.35 * 0.252;

/**
 * Fixed rig. Camera sits back and slightly below the look target so the horizon
 * lands in the bottom ~40% of the viewport — the top majority of the frame is sky,
 * the traveler stays pinned near the bottom.
 */
const VIEW_CAMERA_Y = 0.3;
const VIEW_CAMERA_Z = 2.8;
const VIEW_LOOK_Y = 0.52;
const VIEW_LOOK_Z = 0;

function useLocalModelUri(assetModule: number) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(assetModule);
    asset.downloadAsync().then(() => {
      if (!cancelled) setUri(asset.localUri ?? asset.uri);
    });
    return () => {
      cancelled = true;
    };
  }, [assetModule]);

  return uri;
}

function pickWalkClip(clips: AnimationClip[]) {
  const byWalkName = clips.find((c) => /walk|Walk|stride|Stride|jog|Jog/i.test(c.name));
  if (byWalkName) return byWalkName;

  const dotOne = clips.find((c) => c.name === 'NlaTrack.001' || /\.001$/i.test(c.name));
  if (dotOne) return dotOne;

  const dotTwo = clips.find((c) => c.name === 'NlaTrack.002' || /\.002$/i.test(c.name));
  if (dotTwo) return dotTwo;

  const shortLoops = [...clips].filter((c) => c.duration > 0 && c.duration <= 4);
  shortLoops.sort((a, b) => b.duration - a.duration);
  if (shortLoops[0]) return shortLoops[0];

  return clips[0];
}

type TravelerProps = {
  uri: string;
};

function Traveler({ uri }: TravelerProps) {
  const groupRef = useRef<Group>(null);

  const { scene, animations } = useGLTF(uri, false, false);
  const { actions } = useAnimations(animations, groupRef);

  useLayoutEffect(() => {
    const rim = new Color(palette.rim);
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      /**
       * Rigged GLTFs expose a bind-pose bounding box that often sits outside the
       * animated silhouette → Three.js culls them from the shadow pass even while
       * they're fully on-screen. Opt out of frustum culling so the hero always
       * writes into the shadow atlas.
       */
      child.frustumCulled = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        /**
         * Transparent GLTF materials silently skip the shadow map pass. Force an
         * opaque path + alpha cutout so the hero always writes into shadow casting.
         */
        if (mat.transparent) {
          mat.transparent = false;
          mat.alphaTest = Math.max(mat.alphaTest ?? 0, 0.5);
          mat.needsUpdate = true;
        }
        if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
          applyRimHighlight(mat, rim, 0.26);
        }
      }
    });
  }, [scene]);

  useEffect(() => {
    const clip = pickWalkClip(animations);
    if (!clip) return;
    const action = actions[clip.name];
    if (!action) return;
    action.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.4).play();
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions, animations]);

  return (
    <group
      ref={groupRef}
      rotation={[0, Math.PI / 2, 0]}
      position={[0, GROUND_SURFACE_Y + TRAVELER_FOOT_CLEARANCE, 0]}
      scale={[DISPLAY_SCALE, DISPLAY_SCALE, DISPLAY_SCALE]}
    >
      <primitive object={scene} />
    </group>
  );
}

function SunShadowLight() {
  const ref = useRef<DirectionalLight>(null);

  useLayoutEffect(() => {
    const light = ref.current;
    if (!light) return;
    const cam = light.shadow.camera;
    light.shadow.mapSize.set(2048, 2048);
    /**
     * Tight bounds hugging where the hero + near trees live → crisp character
     * shadow on the 2K atlas (larger boxes smear the tiny hero silhouette away).
     */
    cam.near = 0.4;
    cam.far = 40;
    cam.left = -6;
    cam.right = 6;
    cam.top = 8;
    cam.bottom = -6;
    /**
     * Hero sits ~6cm above the ground. A strong negative bias pushes that
     * contact shadow off the surface entirely; rely on normalBias for acne.
     */
    light.shadow.bias = -0.00005;
    light.shadow.normalBias = 0.035;
    cam.updateProjectionMatrix();
  }, []);

  return (
    <directionalLight
      ref={ref}
      castShadow
      position={[6, 10, 5]}
      intensity={1.45}
      color="#fff8f3"
    />
  );
}

export function Scene3D({ steps }: { steps: number }) {
  const uri = useLocalModelUri(travelerModel);

  return (
    <View style={{ flex: 1, backgroundColor: '#0b1020' }}>
      {!uri ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#a7aec4" />
        </View>
      ) : (
        <Canvas
          style={{ flex: 1 }}
          camera={{ position: [0, VIEW_CAMERA_Y, VIEW_CAMERA_Z], fov: 42 }}
          gl={{ antialias: true }}
          onCreated={({ scene, gl, camera }) => {
            scene.background = new Color(palette.skyTop);
            scene.fog = new Fog(new Color(palette.fog), 5, 38);
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = PCFSoftShadowMap;
            camera.lookAt(0, VIEW_LOOK_Y, VIEW_LOOK_Z);
            camera.updateProjectionMatrix();
          }}
        >
          <ambientLight intensity={0.46} />
          <SunShadowLight />
          <directionalLight position={[-5.5, 4.2, -7.5]} intensity={0.3} color="#bfd6ff" />

          <HorizonSky />

          <WorldScrollRoot steps={steps}>
            <ScrollingEnvironment>
              <CurvedGround />
              <PineForest />
            </ScrollingEnvironment>

            <BlobShadow />

            <Suspense fallback={null}>
              <Traveler uri={uri} />
            </Suspense>
          </WorldScrollRoot>
        </Canvas>
      )}
    </View>
  );
}
