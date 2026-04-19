import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';

import { IDLE_DAMPING_AFTER_STEP, IDLE_SCROLL_SPEED, STEP_TO_WORLD } from './constants';

/**
 * Accumulates path distance from pedometer deltas + idle drift.
 * Must be used only inside `<Canvas>` (uses useFrame).
 */
export function useWorldScroll(steps: number) {
  const scrollRef = useRef(0);
  const stepsRef = useRef(steps);
  const prevStepsRef = useRef(steps);

  stepsRef.current = steps;

  useFrame((_, delta) => {
    const current = stepsRef.current;
    const deltaSteps = Math.max(0, current - prevStepsRef.current);
    prevStepsRef.current = current;

    const fromSteps = deltaSteps * STEP_TO_WORLD;
    const idleFactor = deltaSteps > 0 ? IDLE_DAMPING_AFTER_STEP : 1;
    // Negative distance: the env group uses position.z = -scrollRef so trees move toward +Z world (past the player).
    scrollRef.current -= fromSteps + IDLE_SCROLL_SPEED * delta * idleFactor;
  });

  return scrollRef;
}
