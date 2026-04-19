import { useFrame } from '@react-three/fiber/native';
import { useRef, type ReactNode } from 'react';
import type { Group } from 'three';

import { WorldScrollRefContext } from './ScrollContext';
import { useWorldScroll } from './useWorldScroll';

type Props = {
  steps: number;
  children: ReactNode;
};

/**
 * scrollRef grows negative as you walk; world group moves −scrollRef → +Z so props
 * pass the player (camera sits at +Z looking toward the scene).
 */
export function ScrollingEnvironment({ steps, children }: Props) {
  const groupRef = useRef<Group>(null);
  const scrollRef = useWorldScroll(steps);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.z = -scrollRef.current;
    }
  });

  return (
    <WorldScrollRefContext.Provider value={scrollRef}>
      <group ref={groupRef}>{children}</group>
    </WorldScrollRefContext.Provider>
  );
}
