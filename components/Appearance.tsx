'use client';
import {createContext, useContext, useEffect, type ReactNode, type Dispatch, type SetStateAction} from 'react';
import {useStored} from '../lib/social';

type AppearanceState = {compact: boolean; setCompact: Dispatch<SetStateAction<boolean>>; reduceMotion: boolean; setReduceMotion: Dispatch<SetStateAction<boolean>>};
const AppearanceContext = createContext<AppearanceState | null>(null);

/** Mounted inside SessionBoundary so preferences and document classes follow the current identity. */
export default function Appearance({children}: {children: ReactNode}) {
 const [compact,setCompact] = useStored('intent-compact',false);
 const [reduceMotion,setReduceMotion] = useStored('intent-reduce-motion',false);
 useEffect(()=>{
  document.documentElement.classList.toggle('intent-compact',compact);
  document.documentElement.classList.toggle('intent-reduce-motion',reduceMotion);
  return ()=>{document.documentElement.classList.remove('intent-compact','intent-reduce-motion');};
 },[compact,reduceMotion]);
 return <AppearanceContext.Provider value={{compact,setCompact,reduceMotion,setReduceMotion}}>{children}</AppearanceContext.Provider>;
}
export function useAppearance() {
 const appearance=useContext(AppearanceContext);
 if(!appearance)throw new Error('useAppearance requires the Appearance provider');
 return appearance;
}
