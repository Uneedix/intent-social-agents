/** Cursor pagination for complete histories. Each pass is bounded; callers can resume at the saved cursor. */
export type HistoryCursor={id:string;created_at:string};
export type HistoryLoadResult={complete:boolean;pages:number;loaded:number};
const compare=(a:HistoryCursor,b:HistoryCursor)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
export async function loadTranslationHistory<T extends HistoryCursor>(options:{cursor:T;signal:AbortSignal;current:()=>boolean;fetchPage:(cursor:T)=>Promise<T[]>;commit:(rows:T[],hasMore:boolean)=>void;pageSize?:number;maxPages?:number}):Promise<HistoryLoadResult>{
 const size=options.pageSize||100,max=options.maxPages||50;let cursor=options.cursor,loaded=0;
 for(let page=0;page<max;page++){
  options.signal.throwIfAborted();if(!options.current())throw new Error('history_changed');
  const rows=await options.fetchPage(cursor);
  options.signal.throwIfAborted();if(!options.current())throw new Error('history_changed');
  if(rows.some(row=>compare(row,cursor)>=0))throw new Error('history_cursor_invalid');
  const oldest=[...rows].sort(compare)[0];const more=rows.length===size;
  options.commit(rows,more);loaded+=rows.length;
  if(!more)return {complete:true,pages:page+1,loaded};
  if(!oldest)throw new Error('history_cursor_invalid');cursor=oldest;
 }
 return {complete:false,pages:max,loaded};
}
