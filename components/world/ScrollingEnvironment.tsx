import { useFrame } from '@react-three/fiber/native';
import { useRef, type ReactNode } from 'react';
import type { Group } from 'three';

import { useWorldScrollRef, WorldScrollRefContext } from './ScrollContext';
import { useWorldScroll } from './useWorldScroll';

type RootProps = {
  steps: number;
  children: ReactNode;
};

/**
 * Owns the scroll ref + context for the scrolling world and anything that must stay
 * aligned with the path (e.g. traveler Y vs `groundBendY(scroll)`).
 */
export function WorldScrollRoot({ steps, children }: RootProps) {
  const scrollRef = useWorldScroll(steps);
  return <WorldScrollRefContext.Provider value={scrollRef}>{children}</WorldScrollRefContext.Provider>;
}

type EnvProps = {
  children: ReactNode;
};

/**
 * scrollRef grows negative as you walk; world group moves −scrollRef → +Z so props
 * pass the player (camera sits at +Z looking toward the scene).
 */
export function ScrollingEnvironment({ children }: EnvProps) {
  const groupRef = useRef<Group>(null);
  const scrollRef = useWorldScrollRef();

  useFrame(() => {
    if (!groupRef.current || !scrollRef) return;
    groupRef.current.position.z = -scrollRef.current;
  });

  return <group ref={groupRef}>{children}</group>;
}
