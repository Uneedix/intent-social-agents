import { TRANSLATION_MAX_BODY_BYTES, validateTranslationRequest } from './translation';

type Fetcher = typeof fetch;
export type TranslationDependencies = { authenticate:()=>Promise<string|null>; apiKey:()=>string|undefined; plan?:()=>string|undefined; fetcher?:Fetcher; now?:()=>number };
type Budget = { minute:number;requests:number;hour:number;characters:number };
/** Per-instance defence in depth. Configure provider usage limits too; this is not a distributed billing ledger. */
export class TranslationBudget {
 private entries=new Map<string,Budget>();
 take(id:string,characters:number,now=Date.now()):boolean{
  const minute=Math.floor(now/60000),hour=Math.floor(now/3600000);
  if(this.entries.size>=5000 && !this.entries.has(id)){for(const [key,value] of this.entries)if(value.hour<hour)this.entries.delete(key);if(this.entries.size>=5000)return false;}
  const previous=this.entries.get(id),b=previous?{...previous}:{minute,requests:0,hour,characters:0};
  if(b.minute!==minute){b.minute=minute;b.requests=0;}if(b.hour!==hour){b.hour=hour;b.characters=0;}
  if(b.requests>=30||b.characters+characters>200000)return false;
  b.requests++;b.characters+=characters;this.entries.set(id,b);return true;
 }
}
const budget=new TranslationBudget();
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
async function readBounded(request:Request):Promise<unknown>{
 const length=Number(request.headers.get('content-length'));
 if(Number.isFinite(length)&&length>TRANSLATION_MAX_BODY_BYTES)throw new Error('too_large');
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>TRANSLATION_MAX_BODY_BYTES){await reader.cancel();throw new Error('too_large');}chunks.push(r.value);}}
 finally{reader.releaseLock();}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
}
export async function handleTranslation(request:Request,deps:TranslationDependencies,limits=budget):Promise<Response>{
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'invalid_request'},415);
 // Browser callers must be same origin. Authenticated server callers can omit Origin.
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
 let id:string|null;try{id=await deps.authenticate();}catch{return json({error:'authentication_unavailable'},503);}
 if(!id)return json({error:'sign_in_required'},401);
 let data;try{data=validateTranslationRequest(await readBounded(request));}catch(e){return json({error:e instanceof Error&&e.message==='too_large'?'request_too_large':'invalid_request'},e instanceof Error&&e.message==='too_large'?413:400);}
 if(!data)return json({error:'invalid_request'},400);
 const key=deps.apiKey()?.trim();if(!key)return json({error:'translation_not_configured'},503);
 if(!limits.take(id,data.items.reduce((n,x)=>n+x.text.length,0),deps.now?.()))return json({error:'translation_rate_limit'},429);
 const plan=deps.plan?.()||'free';if(plan!=='free'&&plan!=='pro')return json({error:'translation_not_configured'},503);
 const endpoint=plan==='pro'?'https://api.deepl.com/v2/translate':'https://api-free.deepl.com/v2/translate';
 try{
  const upstream=await (deps.fetcher||fetch)(endpoint,{method:'POST',headers:{'Authorization':`DeepL-Auth-Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({text:data.items.map(x=>x.text),target_lang:data.target,preserve_formatting:true}),signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
  if(!upstream.ok){await upstream.body?.cancel();return json({error:upstream.status===456?'translation_quota_exceeded':upstream.status===429?'translation_rate_limit':upstream.status===403?'translation_provider_auth':'translation_unavailable'},upstream.status===456?429:upstream.status===429?429:502);}
  const reader=upstream.body?.getReader();if(!reader)return json({error:'translation_unavailable'},502);
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>1000000){await reader.cancel();return json({error:'translation_unavailable'},502);}chunks.push(r.value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  const body=JSON.parse(new TextDecoder().decode(all));
  if(!Array.isArray(body.translations)||body.translations.length!==data.items.length||body.translations.some((x:unknown)=>!x||typeof x!=='object'||typeof (x as {text?:unknown}).text!=='string'))return json({error:'translation_unavailable'},502);
  return json({target:data.target,items:data.items.map((x,i)=>({id:x.id,text:body.translations[i].text}))});
 }catch{return json({error:'translation_unavailable'},502);}
}
