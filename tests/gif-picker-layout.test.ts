import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import type {GifPick} from '../components/GifPicker';

test('composer GIF strip keeps one row, loads additional results on request and preserves the chat grid',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout,clearTimeout}});
 const keys=['root','inline','strip','rowResults','rowMore','tile','scroll','masonry','col','top','search','iconBtn','heading','attribution','more'];
 const css=mock.module('../components/GifPicker.module.css',{cache:true,defaultExport:Object.fromEntries(keys.map(k=>[k,k]))});
 const {GifPicker}=await import('../components/GifPicker');
 const result=(id:string,width:number,height:number)=>({id,title:id,url:`https://media.giphy.com/media/${id}/giphy.gif`,previewUrl:`https://media.giphy.com/media/${id}/200w.gif`,width,height});
 const first=result('first',400,200),second=result('second',100,300),third=result('third',200,200);
 const requests:string[]=[];const picked:GifPick[]=[];
 const fetcher:typeof fetch=async input=>{const url=new URL(String(input),'https://intent.test');requests.push(url.href);return new Response(JSON.stringify({provider:'giphy',results:url.searchParams.has('cursor')?[second,third]:[first,second],next:url.searchParams.has('cursor')?null:'next-page'}),{status:200,headers:{'content-type':'application/json'}});};
 let view:ReactTestRenderer|undefined;
 const props={variant:'inline' as const,autoFocus:false,fetcher,onPick:(gif:GifPick)=>picked.push(gif),onClose:()=>{}};
 const tiles=()=>view!.root.findAll(n=>n.type==='button'&&n.props.className==='tile');
 try{
  await act(async()=>{view=create(createElement(GifPicker,{...props,layout:'row'}));});
  assert.equal(view!.root.findAllByProps({className:'rowResults'}).length,1);
  assert.equal(view!.root.findAllByProps({className:'col'}).length,0);
  assert.equal(tiles().length,2);
  for(const tile of tiles()){assert.equal(tile.props.style.height,112);assert.ok(tile.props.style.width>=88&&tile.props.style.width<=220);}
  assert.equal(requests.length,1,'row mode must not prefetch every page automatically');
  await act(async()=>{view!.root.findByProps({className:'rowMore'}).props.onClick();});
  assert.equal(requests.length,2);assert.ok(requests[1].includes('cursor=next-page'));
  assert.deepEqual(tiles().map(n=>n.props['aria-label']),['GIF: first','GIF: second','GIF: third'],'pagination appends results once in provider order');
  await act(async()=>{tiles()[2].props.onClick();});
  assert.equal(picked[0].id,'third');assert.equal(picked[0].provider,'giphy');assert.equal(picked[0].width,200);
  await act(async()=>{view!.update(createElement(GifPicker,{...props,layout:'grid'}));});
  assert.equal(view!.root.findAllByProps({className:'rowResults'}).length,0);
  assert.equal(view!.root.findAllByProps({className:'col'}).length,2,'chat pickers retain their existing grid');
  assert.equal(tiles().length,3);
 }finally{if(view)await act(async()=>view!.unmount());css.restore();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
