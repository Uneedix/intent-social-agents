'use client';
import{useEffect,useRef,useState,type PointerEvent}from'react';
import{LayoutGrid,Trash2}from'lucide-react';
import{useI18n}from'./I18n';
import{LONG_PRESS_MS,launcherPosition,isLauncherOverTrash,sanitizeLauncher,type LauncherState,type Point}from'../lib/mobile-controls';
import s from'./FloatingWidgetLauncher.module.css';
type Props={state:LauncherState;onChange:(state:LauncherState)=>void;onOpen:()=>void;bottomInset?:number};
export default function FloatingWidgetLauncher({state,onChange,onOpen,bottomInset=88}:Props){
 const {lang}=useI18n();const ru=lang==='Русский',pl=lang==='Polski';
 const label=ru?'Мои виджеты':pl?'Moje widżety':'My widgets';
 const hint=ru?'Зажмите, чтобы переместить. Перетащите в корзину, чтобы скрыть кнопку. Вернуть её можно в профиле.':pl?'Przytrzymaj, aby przenieść. Przeciągnij do kosza, aby ukryć. Przywróć w profilu.':'Hold to move. Drag to the bin to hide the button. Restore it in your profile.';
 const [viewport,setViewport]=useState({width:390,height:844});
 const [point,setPoint]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
 const gesture=useRef<{id:number;start:Point;origin:Point;point:Point;active:boolean;cancelled:boolean;node:HTMLButtonElement}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),ignoreClickUntil=useRef(0);
 const prefs=sanitizeLauncher(state);const pos=point??launcherPosition(prefs,viewport.width,viewport.height,bottomInset);
 const clearTimer=()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;};
 const release=()=>{clearTimer();const current=gesture.current;gesture.current=null;if(current?.node.hasPointerCapture(current.id))current.node.releasePointerCapture(current.id);};
 useEffect(()=>{const measure=()=>setViewport({width:window.innerWidth,height:window.visualViewport?.height||window.innerHeight});measure();window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);return()=>{window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};},[]);
 useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);const current=gesture.current;if(current?.node.hasPointerCapture(current.id))current.node.releasePointerCapture(current.id);},[]);
 useEffect(()=>{if(!prefs.hidden)return;if(timer.current!==null)clearTimeout(timer.current);timer.current=null;const current=gesture.current;gesture.current=null;if(current?.node.hasPointerCapture(current.id))current.node.releasePointerCapture(current.id);setPoint(null);setDragging(false);},[prefs.hidden]);
 const cancel=()=>{release();setPoint(null);setDragging(false);ignoreClickUntil.current=Date.now()+400;};
 const start=(event:PointerEvent<HTMLButtonElement>)=>{
  if(event.button!==0||!event.isPrimary||gesture.current)return;
  release();event.currentTarget.setPointerCapture(event.pointerId);
  gesture.current={id:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:pos,point:pos,active:false,cancelled:false,node:event.currentTarget};
  timer.current=setTimeout(()=>{const current=gesture.current;if(current&&!current.cancelled){current.active=true;setDragging(true);setPoint(current.point);}},LONG_PRESS_MS);
 };
 const move=(event:PointerEvent<HTMLButtonElement>)=>{const current=gesture.current;if(!current||current.id!==event.pointerId)return;
  if(!current.active){if(Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>10){current.cancelled=true;clearTimer();}return;}
  event.preventDefault();const next=launcherPosition({...prefs,x:current.origin.x+event.clientX-current.start.x,y:current.origin.y+event.clientY-current.start.y},viewport.width,viewport.height,bottomInset);current.point=next;setPoint(next);
 };
 const end=(event:PointerEvent<HTMLButtonElement>)=>{const current=gesture.current;if(!current||current.id!==event.pointerId)return;
  if(current.active){ignoreClickUntil.current=Date.now()+400;onChange({...prefs,hidden:isLauncherOverTrash(current.point,viewport.width,viewport.height,bottomInset),x:current.point.x,y:current.point.y});}
  else if(current.cancelled)ignoreClickUntil.current=Date.now()+400;
  release();setPoint(null);setDragging(false);
 };
 const over=dragging&&isLauncherOverTrash(pos,viewport.width,viewport.height,bottomInset);
 if(prefs.hidden)return null;
 return <>
  <button type="button" className={`${s.launcher} ${dragging?s.dragging:''}`} style={{left:pos.x,top:pos.y}} aria-label={label} aria-describedby="widget-launcher-help" aria-haspopup="dialog" title={hint}
   onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={event=>{if(gesture.current?.id===event.pointerId)cancel();}} onLostPointerCapture={event=>{if(gesture.current?.id===event.pointerId)cancel();}}
   onClick={event=>{if(event.detail>0&&Date.now()<ignoreClickUntil.current)return;onOpen();}}
   onKeyDown={event=>{if(event.key==='Escape'){if(gesture.current){event.preventDefault();cancel();}return;}if(event.key==='Delete'){event.preventDefault();onChange({...prefs,hidden:true});return;}const dx=event.key==='ArrowLeft'?-16:event.key==='ArrowRight'?16:0,dy=event.key==='ArrowUp'?-16:event.key==='ArrowDown'?16:0;if(dx||dy){event.preventDefault();const next=launcherPosition({...prefs,x:pos.x+dx,y:pos.y+dy},viewport.width,viewport.height,bottomInset);onChange({...prefs,...next});}}}><LayoutGrid size={21}/></button>
  <span id="widget-launcher-help" className={s.srOnly}>{hint}</span>
  {dragging&&<div data-widget-trash="true" role="status" aria-label={ru?'Скрыть кнопку виджетов':pl?'Ukryj przycisk widżetów':'Hide widgets button'} className={`${s.trash} ${over?s.over:''}`} style={{left:viewport.width/2-32,top:viewport.height-bottomInset-76}}><Trash2 size={26}/></div>}
 </>;
}
