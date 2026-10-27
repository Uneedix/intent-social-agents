import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BASE_FOLDER_IDS,normalizeFolderOrder,moveFolder,reorderFolder} from '../lib/chat-folders';

test('damaged stored order cannot introduce, duplicate, or hide known folders',()=>{
 const known=[...BASE_FOLDER_IDS,'list:family','list:work'];
 const damaged=['list:family',null,{},'__proto__','unread','unread','removed-list',5];
 const order=normalizeFolderOrder(damaged,known);
 assert.deepEqual(order,['list:family','unread','all','job','collab','group','other','archived','list:work']);
 assert.equal(new Set(order).size,known.length);
 for(const invalid of [null,{},'all',42])assert.deepEqual(normalizeFolderOrder(invalid,known),known);
 assert.deepEqual(damaged,['list:family',null,{},'__proto__','unread','unread','removed-list',5]);
});
test('new, renamed and deleted custom folders reconcile by ID without losing surviving order',()=>{
 const order=['list:a','group','all'];
 assert.deepEqual(normalizeFolderOrder(order,['all','group','list:a','list:b']),['list:a','group','all','list:b']);
 assert.deepEqual(normalizeFolderOrder(order,['all','group','list:a']),['list:a','group','all'],'renaming changes the label, not its ID');
 assert.deepEqual(normalizeFolderOrder(order,['all','group','list:b']),['group','all','list:b']);
});
test('accessible left/right moves preserve bounds and all unrelated data',()=>{
 const known=['all','unread','list:friends'];const stored=['list:friends','all','unread'];
 assert.deepEqual(moveFolder(stored,known,'all',-1),['all','list:friends','unread']);
 assert.deepEqual(moveFolder(stored,known,'all',1),['list:friends','unread','all']);
 assert.deepEqual(moveFolder(stored,known,'list:friends',-1),stored);
 assert.deepEqual(moveFolder(stored,known,'unread',1),stored);
 assert.deepEqual(moveFolder(stored,known,'missing',1),stored);
 assert.deepEqual(stored,['list:friends','all','unread']);
});
test('drag drop moves only the requested folder and refuses foreign IDs',()=>{
 const known=['all','unread','job','group'];
 assert.deepEqual(reorderFolder(known,known,'all','group'),['unread','job','group','all']);
 assert.deepEqual(reorderFolder(known,known,'group','unread'),['all','group','unread','job']);
 assert.deepEqual(reorderFolder(known,known,'foreign','all'),known);
 assert.deepEqual(reorderFolder(known,known,'all','foreign'),known);
 assert.deepEqual(reorderFolder(known,known,'job','job'),known);
 assert.deepEqual(known,['all','unread','job','group']);
});
test('orders from separate account storage values stay independent',()=>{
 const known=['all','unread','group'];const alice=moveFolder(known,known,'group',-1);const bob=normalizeFolderOrder(null,known);
 assert.deepEqual(alice,['all','group','unread']);assert.deepEqual(bob,known);
 assert.deepEqual(normalizeFolderOrder(alice,known),alice);
});
