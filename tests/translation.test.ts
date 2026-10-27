import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateTranslationRequest,translationBatches} from '../lib/translation';
import {handleTranslation,TranslationBudget,type TranslationDependencies} from '../lib/translation-server';
const input={target:'RU',items:[{id:'one',text:'Hello'},{id:'two',text:'Goodbye'}]};
const request=(data:unknown=input,headers:Record<string,string>={})=>new Request('https://intent.test/api/translate',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://intent.test',...headers},body:JSON.stringify(data)});
const deps=(more:Partial<TranslationDependencies>={}):TranslationDependencies=>({authenticate:async()=> 'alice',apiKey:()=> 'fixture',...more});

test('translation validation rejects invalid language, IDs, payload and oversized batches',()=>{
 assert.ok(validateTranslationRequest(input));
 assert.equal(validateTranslationRequest({...input,target:'xx'}),null);
 assert.equal(validateTranslationRequest({...input,items:[{id:'a',text:'one'},{id:'a',text:'two'}]}),null);
 assert.equal(validateTranslationRequest({...input,items:[{id:'a',text:''}]}),null);
 assert.equal(validateTranslationRequest({...input,items:[{id:'a',text:'x'.repeat(10001)}]}),null);
 assert.equal(validateTranslationRequest({...input,items:Array.from({length:51},(_,i)=>({id:String(i),text:'a'}))}),null);
 const batches=translationBatches(Array.from({length:106},(_,i)=>({id:String(i),text:'x'.repeat(700)})));
 assert.deepEqual(batches.flat().map(x=>x.id),Array.from({length:106},(_,i)=>String(i)));
 assert.ok(batches.every(batch=>batch.length<=50&&batch.reduce((n,x)=>n+x.text.length,0)<=20000));
 assert.throws(()=>translationBatches([{id:'x',text:'a'.repeat(10001)}]));
});

test('translation proxy requires identity, same origin, valid bounded body and configured key before contacting provider',async()=>{
 let contacted=0;const fetcher:typeof fetch=async()=>{contacted++;throw new Error('must not contact');};
 for(const [req,override,status] of [
  [request(),{authenticate:async()=>null},401],
  [request(input,{origin:'https://other.test'}),{},403],
  [request(input,{'content-type':'text/plain'}),{},415],
  [request({...input,target:'invalid'}),{},400],
  [request(),{apiKey:()=>undefined},503],
  [request({...input,items:[{id:'a',text:'x'.repeat(110000)}]}),{},413],
 ] as const){const response=await handleTranslation(req,deps({...override,fetcher}),new TranslationBudget());assert.equal(response.status,status);assert.equal(response.headers.get('Cache-Control'),'private, no-store');}
 assert.equal(contacted,0);
});

test('translation proxy preserves order, authenticates only on the fixed provider and strips extra provider data',async()=>{
 const calls:{url:string;body:Record<string,unknown>}[]=[];
 const fetcher:typeof fetch=async(url,init)=>{assert.equal(new Headers(init?.headers).get('Authorization'),'DeepL-Auth-Key fixture');assert.equal(init?.redirect,'error');calls.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json({translations:[{text:'Привет',detected_source_language:'EN'},{text:'Пока'}],extra:'do not forward'});};
 const result=await handleTranslation(request(),deps({fetcher}),new TranslationBudget());assert.equal(result.status,200);assert.deepEqual(await result.json(),{target:'RU',items:[{id:'one',text:'Привет'},{id:'two',text:'Пока'}]});
 assert.equal(calls[0].url,'https://api-free.deepl.com/v2/translate');assert.deepEqual(calls[0].body.text,['Hello','Goodbye']);
 await handleTranslation(request(),deps({fetcher,plan:()=> 'pro'}),new TranslationBudget());assert.equal(calls[1].url,'https://api.deepl.com/v2/translate');
});

test('translation proxy handles quota/auth/errors without forwarding raw provider messages',async()=>{
 for(const [status,error] of [[456,'translation_quota_exceeded'],[429,'translation_rate_limit'],[403,'translation_provider_auth'],[500,'translation_unavailable']] as const){
  const response=await handleTranslation(request(),deps({fetcher:async()=>Response.json({message:'provider-secret-detail'},{status})}),new TranslationBudget());const body=await response.json();assert.equal(body.error,error);assert.ok(!JSON.stringify(body).includes('provider-secret-detail'));
 }
 const malformed=await handleTranslation(request(),deps({fetcher:async()=>Response.json({translations:[{text:'missing second'}]})}),new TranslationBudget());assert.equal(malformed.status,502);
});

test('translation budgets isolate users and enforce request and source-character ceilings',async()=>{
 const budget=new TranslationBudget();for(let i=0;i<30;i++)assert.equal(budget.take('alice',1,0),true);assert.equal(budget.take('alice',1,0),false);assert.equal(budget.take('bob',1,0),true);assert.equal(budget.take('alice',1,60000),true);
 const count=new TranslationBudget();assert.equal(count.take('alice',200000,0),true);assert.equal(count.take('alice',1,60000),false);assert.equal(count.take('alice',1,3600000),true);
 let contacted=0;const blocked=new TranslationBudget();blocked.take('alice',200000);
 const response=await handleTranslation(request(),deps({fetcher:async()=>{contacted++;return Response.json({});}}),blocked);assert.equal(response.status,429);assert.equal(contacted,0);
});
