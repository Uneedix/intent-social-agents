import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {createElement} from 'react';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
test('pin dialog requires an explicit audience and the pin list keeps multiple scopes independently',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const css=mock.module('../components/ui/index.tsx',{cache:true,namedExports:{Modal:({children,footer}:{children:import('react').ReactNode;footer:import('react').ReactNode})=>createElement('section',null,children,footer),Button:({children,...props}:import('react').ButtonHTMLAttributes<HTMLButtonElement>)=>createElement('button',props,children)}});
 const {PinDialog,PinnedList}=await import('../components/MessagePins');
 const chosen:string[]=[];let view:ReactTestRenderer|undefined;
 const text=(n:import('react-test-renderer').ReactTestInstance):string=>n.children.map(x=>typeof x==='string'?x:text(x)).join('');
 try{
  await act(async()=>{view=create(createElement(PinDialog,{local:true,onChoose:x=>chosen.push(x),onClose:()=>chosen.push('cancel')}));});
  assert.deepEqual(chosen,[],'opening a dialog must not pin anything');
  await act(async()=>view!.root.findAllByType('button').find(n=>text(n)==='For myself')!.props.onClick());
  await act(async()=>view!.root.findAllByType('button').find(n=>text(n)==='For everyone')!.props.onClick());
  assert.deepEqual(chosen,['self','everyone']);
  const removed:string[]=[];
  await act(async()=>view!.update(createElement(PinnedList,{rows:[{id:'one',text:'first',scope:'self'},{id:'two',text:'second',scope:'everyone'}],onRemove:(id,scope)=>removed.push(id+':'+scope)})));
  assert.match(text(view!.root),/Pinned messages · 2/);
  await act(async()=>view!.root.findAllByType('button').find(n=>n.props['aria-expanded']===false)!.props.onClick());
  assert.match(text(view!.root),/first/);assert.match(text(view!.root),/second/);
  await act(async()=>view!.root.findAllByType('button').filter(n=>n.props['aria-label']==='Unpin · For myself')[0].props.onClick());
  assert.deepEqual(removed,['one:self']);
  await act(async()=>view!.update(createElement(PinnedList,{rows:[{id:'one',text:'first',scope:'self'},{id:'one',text:'first',scope:'everyone',canRemove:false},{id:'two',text:'second',scope:'everyone'}],onRemove:(id,scope)=>removed.push(id+':'+scope)})));
  assert.match(text(view!.root),/Pinned messages · 2/,'same message appears only once even when pinned for both audiences');
  assert.equal(view!.root.findAll(n=>n.props.role==='listitem').length,2);
  assert.equal(view!.root.findAllByType('button').filter(n=>n.props['aria-label']==='Unpin · For everyone').length,1,'cannot remove another member pin without permission');
 }finally{if(view)await act(async()=>view!.unmount());css.restore();}
});
