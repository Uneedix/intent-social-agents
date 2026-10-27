import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {createElement,type ReactNode} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import type {TranslationItem} from '../lib/translation';
import type {TranslationHistoryLoader} from '../components/TranslationControls';
import type {HistoryLoadResult} from '../lib/translation-history';

test('history translation waits for explicit consent, caches messages, includes new history and resets between conversations',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const css=mock.module('../components/TranslationControls.module.css',{cache:true,defaultExport:{}});
 let signedIn=true;
 const session=mock.module('../components/SessionBoundary.tsx',{cache:true,namedExports:{useSession:()=>({user:signedIn?{id:'alice'}:null,scope:signedIn?'alice':'guest'})}});
 const ui=mock.module('../components/ui/index.tsx',{cache:true,namedExports:{Modal:({children,footer}:{children:ReactNode;footer:ReactNode})=>createElement('section',{'data-modal':true},children,footer),Button:({children,...props}:{children:ReactNode})=>createElement('button',props,children)}});
 const prior=globalThis.fetch;const requests:{target:string;items:TranslationItem[]}[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));requests.push(body);return Response.json({items:body.items.map((x:TranslationItem)=>({id:x.id,text:'translated '+x.text}))});};
 const {useHistoryTranslation}=await import('../components/TranslationControls');
 function Harness({conversation,items,history}:{conversation:string;items:TranslationItem[];history?:TranslationHistoryLoader}){const h=useHistoryTranslation(conversation,items,history);return createElement('main',null,h.toolbar,...items.map(x=>createElement('p',{key:x.id,'data-message':x.id},h.text(x.id,x.text))));}
 let view:ReactTestRenderer|undefined;
 const button=(text:string)=>view!.root.findAll(n=>n.type==='button').find(n=>n.children.some(x=>typeof x==='string'&&x.includes(text)))!;
 try{
  await act(async()=>{view=create(createElement(Harness,{conversation:'one',items:[{id:'a',text:'Hello'}]}));});assert.equal(requests.length,0);
  await act(async()=>{button('Translate history').props.onClick();});assert.equal(button('Enable translation').props.disabled,true);
  await act(async()=>{view!.root.findByType('input').props.onChange({target:{checked:true}});});
  await act(async()=>{button('Enable translation').props.onClick();});assert.equal(requests.length,1);assert.equal(view!.root.findByProps({'data-message':'a'}).findAllByType('span')[0].children[0],'translated Hello');
  await act(async()=>{view!.update(createElement(Harness,{conversation:'one',items:[{id:'a',text:'Hello'},{id:'b',text:'Older history'}]}));});assert.equal(requests.length,2);assert.deepEqual(requests[1].items,[{id:'b',text:'Older history'}]);
  await act(async()=>{button('Show original').props.onClick();});assert.deepEqual(view!.root.findByProps({'data-message':'a'}).children,['Hello']);assert.equal(requests.length,2);
  await act(async()=>{view!.update(createElement(Harness,{conversation:'two',items:[{id:'a',text:'Private new chat'}]}));});assert.equal(requests.length,2);assert.deepEqual(view!.root.findByProps({'data-message':'a'}).children,['Private new chat']);
  signedIn=false;await act(async()=>{view!.update(createElement(Harness,{conversation:'two',items:[{id:'a',text:'Guest text'}]}));});
  await act(async()=>{button('Translate history').props.onClick();});assert.equal(button('Enable translation').props.disabled,true);assert.equal(requests.length,2);
  signedIn=true;let complete:(result:HistoryLoadResult)=>void=()=>{};const signals:AbortSignal[]=[];
  const history:TranslationHistoryLoader={hasOlder:true,loadAll:signal=>{signals.push(signal);return new Promise(resolve=>{complete=resolve;});}};
  await act(async()=>{view!.update(createElement(Harness,{conversation:'full-history',items:[{id:'a',text:'Newest page'}],history}));});
  await act(async()=>{button('Translate history').props.onClick();});
  await act(async()=>{view!.root.findByType('input').props.onChange({target:{checked:true}});});
  await act(async()=>{button('Enable translation').props.onClick();});assert.equal(signals.length,1);assert.equal(requests.length,2,'provider waits until paginated history pass completes');
  await act(async()=>{complete({complete:false,pages:50,loaded:5000});});assert.equal(requests.length,3);assert.ok(button('Continue loading history'));
  await act(async()=>{button('Continue loading history').props.onClick();});assert.equal(signals.length,2);
  await act(async()=>{view!.root.findByProps({'aria-label':'Turn off translation'}).props.onClick();});assert.equal(signals[1].aborted,true,'stopping translation cancels remaining history loads');assert.equal(requests.length,3);
 }finally{if(view)await act(async()=>view!.unmount());globalThis.fetch=prior;css.restore();ui.restore();session.restore();}
});
