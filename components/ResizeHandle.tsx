'use client';
import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { clampWidth } from '../lib/panel-layout';
import styles from './ResizeHandle.module.css';

type Props = { label:string; value:number; min:number; max:number; onChange:(value:number)=>void; onReset:()=>void; reverse?:boolean; step?:number; disabled?:boolean; className?:string; style?:CSSProperties };
export default function ResizeHandle({label,value,min,max,onChange,onReset,reverse=false,step=16,disabled=false,className='',style}:Props) {
  const drag = useRef<{id:number;x:number;value:number;node:HTMLDivElement;cursor:string;select:string}|null>(null);
  const current = clampWidth(value,min,max,min);
  const restore = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    document.body.style.cursor = active.cursor;
    document.body.style.userSelect = active.select;
    if (active.node.hasPointerCapture(active.id)) active.node.releasePointerCapture(active.id);
  }, []);
  useEffect(() => () => restore(), [restore]);
  useEffect(() => { if (disabled) restore(); }, [disabled,restore]);
  const start = (event:PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    restore();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {id:event.pointerId,x:event.clientX,value:current,node:event.currentTarget,cursor:document.body.style.cursor,select:document.body.style.userSelect};
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
  };
  const move = (event:PointerEvent<HTMLDivElement>) => {
    const active=drag.current;
    if (!active || active.id!==event.pointerId || disabled) return;
    onChange(clampWidth(active.value+(event.clientX-active.x)*(reverse?-1:1),min,max,current));
  };
  const cancel = () => { const active=drag.current;if(active)onChange(active.value);restore(); };
  const key = (event:KeyboardEvent<HTMLDivElement>) => {
    if(disabled)return;
    if(event.key==='Escape'){if(drag.current){event.preventDefault();cancel();}return;}
    if(event.key==='Home'){event.preventDefault();onChange(min);return;}
    if(event.key==='End'){event.preventDefault();onChange(max);return;}
    if(event.key==='Enter'){event.preventDefault();onReset();return;}
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();
    const direction=(event.key==='ArrowRight'?1:-1)*(reverse?-1:1);
    onChange(clampWidth(current+direction*step*(event.shiftKey?4:1),min,max,current));
  };
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-disabled={disabled||undefined} tabIndex={disabled?-1:0}
    title={label} className={`${styles.handle} ${className}`} style={style} onPointerDown={start} onPointerMove={move}
    onPointerUp={event=>{if(drag.current?.id===event.pointerId)restore();}} onPointerCancel={event=>{if(drag.current?.id===event.pointerId)cancel();}} onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)restore();}}
    onDoubleClick={()=>{if(!disabled)onReset();}} onKeyDown={key}><span aria-hidden="true" /></div>;
}
