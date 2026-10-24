export const WIDGET_TYPES = ['calendar','tasks','notes','focus','countdown','rates','links','goals'] as const;
export type WidgetType = typeof WIDGET_TYPES[number];
export const CURRENCIES = ['EUR','USD','PLN','GBP','CHF'] as const;
export type Currency = typeof CURRENCIES[number];
export type Preset = 'student'|'research'|'business';
export type FocusData = {minutes:number; remaining:number; deadline:number|null};
export type WidgetData = {
 notes:{text:string};
 tasks:{items:{id:string;text:string;done:boolean}[]};
 calendar:{date:string;events:{id:string;title:string;date:string}[]};
 focus:FocusData;
 countdown:{title:string;date:string};
 rates:{base:Currency};
 links:{items:{id:string;title:string;url:string}[]};
 goals:{title:string;target:number;progress:number};
};
export type Widget = {[K in WidgetType]:{id:string;type:K;collapsed:boolean;data:WidgetData[K]}}[WidgetType];
export type PanelState = {version:1;widgets:Widget[]};
export const LIMITS = {widgets:8,notes:4000,tasks:30,events:30,links:12,label:120} as const;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
const bounded=(value:unknown,min:number,max:number,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,Math.floor(value))):fallback;
export function widgetId(){return globalThis.crypto?.randomUUID?.()||`widget-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
export function localDate(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function validDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);const date=new Date(y,m-1,d);
 return y>=1900&&y<=2200&&date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}
export function validDateTime(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!validDate(value.slice(0,10)))return false;
 const hour=Number(value.slice(11,13)),minute=Number(value.slice(14,16));
 return hour<24&&minute<60&&Number.isFinite(new Date(value).getTime());
}
export function safeLink(value:unknown):string|null {
 if(typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))return null;
 try{const url=new URL(value.trim());return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function createWidget<K extends WidgetType>(type:K,today=localDate()):Extract<Widget,{type:K}> {
 const data:WidgetData={notes:{text:''},tasks:{items:[]},calendar:{date:validDate(today)?today:localDate(),events:[]},focus:{minutes:25,remaining:1500,deadline:null},countdown:{title:'',date:''},rates:{base:'EUR'},links:{items:[]},goals:{title:'',target:7,progress:0}};
 return {id:widgetId(),type,collapsed:false,data:data[type]} as Extract<Widget,{type:K}>;
}
export function defaultPanel(today=localDate()):PanelState{return {version:1,widgets:[createWidget('calendar',today),createWidget('tasks',today),createWidget('notes',today)]};}
function entries(value:unknown,max:number):Record<string,unknown>[] {return Array.isArray(value)?value.slice(0,max).filter(record):[];}
function unique<T extends {id:string}>(items:T[]):T[]{return [...new Map(items.map(item=>[item.id,item])).values()];}
/** Empty localStorage arrays are not a schema: validate every persisted field before rendering. */
export function validatePanel(value:unknown,today=localDate()):PanelState {
 if(!record(value)||value.version!==1||!Array.isArray(value.widgets))return defaultPanel(today);
 today=validDate(today)?today:localDate();
 const widgets:Widget[]=[];const types=new Set<string>();const ids=new Set<string>();
 for(const raw of value.widgets.slice(0,LIMITS.widgets)){
  if(!record(raw)||typeof raw.type!=='string'||!WIDGET_TYPES.includes(raw.type as WidgetType)||!record(raw.data)||types.has(raw.type))continue;
  const type=raw.type as WidgetType;const item=createWidget(type,today);const data=raw.data;
  item.id=typeof raw.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)&&!ids.has(raw.id)?raw.id:widgetId();item.collapsed=raw.collapsed===true;
  switch(item.type){
   case 'notes':item.data={text:text(data.text,LIMITS.notes)};break;
   case 'tasks':item.data={items:unique(entries(data.items,LIMITS.tasks).filter(x=>typeof x.text==='string'&&x.text.trim()).map(x=>({id:text(x.id,100)||widgetId(),text:text(x.text,LIMITS.label),done:x.done===true})))};break;
   case 'calendar':item.data={date:validDate(data.date)?data.date:today,events:unique(entries(data.events,LIMITS.events).filter(x=>typeof x.title==='string'&&x.title.trim()&&validDate(x.date)).map(x=>({id:text(x.id,100)||widgetId(),title:text(x.title,LIMITS.label),date:x.date as string})))};break;
   case 'focus':item.data={minutes:bounded(data.minutes,1,90,25),remaining:bounded(data.remaining,0,5400,1500),deadline:typeof data.deadline==='number'&&Number.isFinite(data.deadline)&&data.deadline>0&&data.deadline<8640000000000000?data.deadline:null};break;
   case 'countdown':item.data={title:text(data.title,LIMITS.label),date:validDateTime(data.date)?data.date:''};break;
   case 'rates':item.data={base:CURRENCIES.includes(data.base as Currency)?data.base as Currency:'EUR'};break;
   case 'links':item.data={items:unique(entries(data.items,LIMITS.links).filter(x=>safeLink(x.url)&&typeof x.title==='string'&&x.title.trim()).map(x=>({id:text(x.id,100)||widgetId(),title:text(x.title,LIMITS.label),url:safeLink(x.url)!})))};break;
   case 'goals':{const target=bounded(data.target,1,365,7);item.data={title:text(data.title,LIMITS.label),target,progress:bounded(data.progress,0,target,0)};break;}
  }
  widgets.push(item);types.add(type);ids.add(item.id);
 }
 return {version:1,widgets};
}
export function applyPreset(state:PanelState,preset:Preset):PanelState {
 const presets:Record<Preset,WidgetType[]>={student:['calendar','tasks','notes','focus'],research:['notes','links','focus','goals'],business:['calendar','tasks','rates','countdown']};
 const widgets=[...state.widgets];for(const type of presets[preset])if(!widgets.some(item=>item.type===type)&&widgets.length<LIMITS.widgets)widgets.push(createWidget(type));
 return {...state,widgets};
}
export function moveWidget(state:PanelState,id:string,direction:-1|1):PanelState {
 const widgets=[...state.widgets],index=widgets.findIndex(item=>item.id===id),next=index+direction;
 if(index<0||next<0||next>=widgets.length)return state;
 [widgets[index],widgets[next]]=[widgets[next],widgets[index]];return {...state,widgets};
}
export function remainingFocusSeconds(data:FocusData,now=Date.now()):number {return data.deadline===null?Math.max(0,data.remaining):Math.max(0,Math.min(5400,Math.ceil((data.deadline-now)/1000)));}
export function startFocus(data:FocusData,now=Date.now()):FocusData {const remaining=remainingFocusSeconds(data,now)||data.minutes*60;return {...data,remaining,deadline:now+remaining*1000};}
export function pauseFocus(data:FocusData,now=Date.now()):FocusData {return {...data,remaining:remainingFocusSeconds(data,now),deadline:null};}
export type RatesResponse={base:Currency;date:string;rates:Partial<Record<Currency,number>>;source:'Frankfurter'};
export function validateRates(value:unknown,base:Currency):RatesResponse|null {
 if(!record(value)||value.base!==base||value.source!=='Frankfurter'||!validDate(value.date)||!record(value.rates))return null;
 const rates:Partial<Record<Currency,number>>={};
 for(const code of CURRENCIES){const rate=value.rates[code];if(rate!==undefined){if(typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||rate>1000000)return null;rates[code]=rate;}}
 if(CURRENCIES.some(code=>code!=='CHF'&&code!==base&&rates[code]===undefined)||(rates[base]!==undefined&&rates[base]!==1))return null;
 rates[base]=1;return {base,date:value.date,rates,source:'Frankfurter'};
}
