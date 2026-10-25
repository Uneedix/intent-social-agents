export const LAUNCHER_SIZE=48;
export const LONG_PRESS_MS=350;
export type LauncherState={version:1;hidden:boolean;x:number|null;y:number|null};
export type Point={x:number;y:number};
export const DEFAULT_LAUNCHER:LauncherState={version:1,hidden:false,x:null,y:null};
const finite=(value:unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
export function sanitizeLauncher(value:unknown):LauncherState {
 if(!value||typeof value!=='object'||Array.isArray(value))return {...DEFAULT_LAUNCHER};
 const row=value as Record<string,unknown>;
 if(row.version!==1)return {...DEFAULT_LAUNCHER};
 return {version:1,hidden:row.hidden===true,x:typeof row.x==='number'&&Number.isFinite(row.x)?row.x:null,y:typeof row.y==='number'&&Number.isFinite(row.y)?row.y:null};
}
export function launcherPosition(state:LauncherState,width:number,height:number,bottomInset=88):Point {
 const w=Math.max(0,finite(width)),h=Math.max(0,finite(height)),bottom=Math.max(0,finite(bottomInset,88));
 const minX=Math.min(12,Math.max(0,w-LAUNCHER_SIZE)),maxX=Math.max(minX,w-LAUNCHER_SIZE-12);
 const minY=Math.min(72,Math.max(0,h-LAUNCHER_SIZE)),maxY=Math.max(minY,h-bottom-LAUNCHER_SIZE-12);
 return {x:Math.round(Math.min(maxX,Math.max(minX,finite(state.x,maxX)))),y:Math.round(Math.min(maxY,Math.max(minY,finite(state.y,Math.max(minY,maxY-76)))))};
}
export function isLauncherOverTrash(point:Point,width:number,height:number,bottomInset=88):boolean {
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<LAUNCHER_SIZE||height<LAUNCHER_SIZE||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
 const x=width/2,y=height-Math.max(0,finite(bottomInset,88))-44;
 return Math.hypot(point.x+LAUNCHER_SIZE/2-x,point.y+LAUNCHER_SIZE/2-y)<=48;
}
