import { useGLTF, useAnimations } from '@react-three/drei/native';
import { Canvas } from '@react-three/fiber/native';
import { Asset } from 'expo-asset';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Color, Fog } from 'three';
import type { AnimationClip, Group } from 'three';
import { LoopRepeat } from 'three';

import travelerModel from '../assets/models/traveler_1.glb';
import { CurvedGround, GroundTintBand } from './world/CurvedGround';
import { HorizonSky } from './world/HorizonSky';
import { palette } from './world/palette';
import { PineForest } from './world/PineForest';
import { ScrollingEnvironment } from './world/ScrollingEnvironment';

/** Previous hero scale; current size is 30% of that (70% smaller). */
const DISPLAY_SCALE = 1.35 * 0.3;

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
      position={[0, -0.28, 0]}
      scale={[DISPLAY_SCALE, DISPLAY_SCALE, DISPLAY_SCALE]}
    >
      <primitive object={scene} />
    </group>
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
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ height: '50%', width: '100%' }}>
            <Canvas
              style={{ flex: 1 }}
              camera={{ position: [0, 0.52, 1.82], fov: 42 }}
              gl={{ antialias: true }}
              onCreated={({ scene }) => {
                scene.background = new Color(palette.skyTop);
                scene.fog = new Fog(new Color(palette.fog), 5, 38);
              }}
            >
              <ambientLight intensity={1.1} />
              <directionalLight position={[5, 10, 6]} intensity={1.15} color="#fff5f0" />
              <directionalLight position={[-4, 3, -6]} intensity={0.35} color="#b8d4ff" />

              <HorizonSky />

              <ScrollingEnvironment steps={steps}>
                <CurvedGround />
                <GroundTintBand />
                <PineForest />
              </ScrollingEnvironment>

              <Suspense fallback={null}>
                <Traveler uri={uri} />
              </Suspense>
            </Canvas>
          </View>
        </View>
      )}
    </View>
  );
}
