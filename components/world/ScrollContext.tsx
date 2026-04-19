import { createContext, useContext, type MutableRefObject } from 'react';

export const WorldScrollRefContext = createContext<MutableRefObject<number> | null>(null);

export function useWorldScrollRef() {
  const ctx = useContext(WorldScrollRefContext);
  return ctx;
}
