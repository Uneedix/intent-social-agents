import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadTranslationHistory,type HistoryCursor} from '../lib/translation-history';
const rows=Array.from({length:351},(_,i)=>({id:String(i+1).padStart(5,'0'),created_at:'2026-10-26T00:00:00.000Z'}));
const before=(a:HistoryCursor,b:HistoryCursor)=>a.created_at<b.created_at||a.created_at===b.created_at&&a.id<b.id;

test('complete history loader pages beyond 300, resolves timestamp ties and stops at the true beginning',async()=>{
 const initial=rows.slice(-100),committed:HistoryCursor[]=[...initial];let calls=0;let cursor=initial[0];
 const result=await loadTranslationHistory({cursor,signal:new AbortController().signal,current:()=>true,fetchPage:async c=>{calls++;return rows.filter(x=>before(x,c)).slice(-100).reverse();},commit:batch=>{committed.push(...batch);if(batch.length)cursor=[...batch].sort((a,b)=>a.id.localeCompare(b.id))[0];}});
 assert.equal(result.complete,true);assert.equal(result.loaded,251);assert.equal(calls,3);assert.equal(new Set(committed.map(x=>x.id)).size,351);assert.equal(cursor.id,'00001');
});

test('complete history loader is bounded per pass, resumes from its cursor and never silently truncates',async()=>{
 let cursor=rows[350];const loaded:HistoryCursor[]=[];
 const options={signal:new AbortController().signal,current:()=>true,pageSize:100,maxPages:2,fetchPage:async(c:HistoryCursor)=>rows.filter(x=>before(x,c)).slice(-100).reverse(),commit:(batch:HistoryCursor[])=>{loaded.push(...batch);if(batch.length)cursor=[...batch].sort((a,b)=>a.id.localeCompare(b.id))[0];}};
 const first=await loadTranslationHistory({...options,cursor});assert.equal(first.complete,false);assert.equal(first.pages,2);
 const second=await loadTranslationHistory({...options,cursor});assert.equal(second.complete,true);assert.equal(new Set(loaded.map(x=>x.id)).size,350);
});

test('complete history loader cancels on stop or changed conversation and rejects non-advancing provider pages',async()=>{
 const controller=new AbortController();let commits=0;
 await assert.rejects(loadTranslationHistory({cursor:rows[350],signal:controller.signal,current:()=>true,fetchPage:async()=>{controller.abort();return rows.slice(0,100);},commit:()=>{commits++;}}));assert.equal(commits,0);
 let current=true;
 await assert.rejects(loadTranslationHistory({cursor:rows[350],signal:new AbortController().signal,current:()=>current,fetchPage:async()=>{current=false;return rows.slice(0,100);},commit:()=>{commits++;}}),/history_changed/);assert.equal(commits,0);
 await assert.rejects(loadTranslationHistory({cursor:rows[350],signal:new AbortController().signal,current:()=>true,fetchPage:async()=>[rows[350]],commit:()=>{commits++;}}),/history_cursor_invalid/);assert.equal(commits,0);
});
