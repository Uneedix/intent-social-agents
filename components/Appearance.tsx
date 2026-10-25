'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, type ReactNode, type Dispatch, type SetStateAction} from 'react';
import {useStored} from '../lib/social';
import {DEFAULT_PANE_SIZES, PANE_STORAGE_KEY, sanitizePaneSizes, withPaneSize, type PaneId, type PaneSizes} from '../lib/pane-sizes';

type AppearanceState = {
 compact: boolean; setCompact: Dispatch<SetStateAction<boolean>>;
 reduceMotion: boolean; setReduceMotion: Dispatch<SetStateAction<boolean>>;
 paneSizes: PaneSizes; setPaneSize: (id: PaneId, value: number | null) => void; resetPaneSizes: () => void;
};
const AppearanceContext = createContext<AppearanceState | null>(null);

/** Mounted inside SessionBoundary so preferences and document classes follow the current identity. */
export default function Appearance({children}: {children: ReactNode}) {
 const [compact,setCompact] = useStored('intent-compact',false);
 const [reduceMotion,setReduceMotion] = useStored('intent-reduce-motion',false);
 const [storedPanes,setStoredPanes] = useStored<PaneSizes>(PANE_STORAGE_KEY,DEFAULT_PANE_SIZES);
 const paneSizes = useMemo(()=>sanitizePaneSizes(storedPanes),[storedPanes]);
 const setPaneSize = useCallback((id: PaneId, value: number | null)=>setStoredPanes(current=>withPaneSize(current,id,value)),[setStoredPanes]);
 const resetPaneSizes = useCallback(()=>setStoredPanes({...DEFAULT_PANE_SIZES}),[setStoredPanes]);
 useEffect(()=>{
  document.documentElement.classList.toggle('intent-compact',compact);
  document.documentElement.classList.toggle('intent-reduce-motion',reduceMotion);
  return ()=>{document.documentElement.classList.remove('intent-compact','intent-reduce-motion');};
 },[compact,reduceMotion]);
 return <AppearanceContext.Provider value={{compact,setCompact,reduceMotion,setReduceMotion,paneSizes,setPaneSize,resetPaneSizes}}>{children}</AppearanceContext.Provider>;
}
/** For components that may render outside the provider (isolated tests); returns null there. */
export const useOptionalAppearance = () => useContext(AppearanceContext);
export function useAppearance() {
 const appearance=useContext(AppearanceContext);
 if(!appearance)throw new Error('useAppearance requires the Appearance provider');
 return appearance;
}
