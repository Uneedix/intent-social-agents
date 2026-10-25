'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useStored } from '../lib/social';
import { fitFeedWidths } from '../lib/panel-layout';
import { useI18n } from './I18n';
import ResizeHandle from './ResizeHandle';
import styles from './FeedPanels.module.css';

export default function FeedPanels({enabled,children}:{enabled:boolean;children:ReactNode}) {
  const [preferred,setPreferred]=useStored('intent-feed-rail-width',325);
  const [size,setSize]=useState({width:0,nav:286,gap:32});
  const element=useRef<HTMLDivElement>(null);
  const {lang}=useI18n();
  const label=lang==='Русский'?'Ширина правой панели':lang==='Polski'?'Szerokość prawego panelu':'Right panel width';
  useEffect(()=>{
    const node=element.current;if(!node)return;
    const measure=()=>{const css=getComputedStyle(node);setSize({width:node.clientWidth,nav:parseFloat(css.getPropertyValue('--feed-nav-width'))||286,gap:parseFloat(css.columnGap)||32});};
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[enabled]);
  const fitted=fitFeedWidths(size.width,preferred,size.nav,size.gap);
  const maximum=Math.min(520,Math.max(240,size.width-size.nav-size.gap*2-360));
  return <div ref={element} className={`app ${enabled?styles.layout:''}`} style={{'--feed-rail-width':`${fitted.rail||325}px`} as CSSProperties}>
    {children}
    {enabled&&<ResizeHandle label={label} value={fitted.rail||325} min={240} max={maximum} onChange={setPreferred} onReset={()=>setPreferred(325)} reverse disabled={!fitted.enabled} className={styles.separator}/>}
  </div>;
}
