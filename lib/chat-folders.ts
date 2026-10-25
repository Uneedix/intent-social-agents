/** Folder IDs are presentation state only; reordering never edits chats or folder membership. */
export const BASE_FOLDER_IDS = ['all','unread','job','collab','group','other','archived'] as const;
export function normalizeFolderOrder(value:unknown,knownIds:readonly string[]):string[] {
 const known=[...new Set(knownIds.filter(id=>typeof id==='string'&&id.length>0))];
 const allowed=new Set(known);const seen=new Set<string>();const order:string[]=[];
 if(Array.isArray(value))for(const id of value){if(typeof id==='string'&&allowed.has(id)&&!seen.has(id)){seen.add(id);order.push(id);}}
 for(const id of known)if(!seen.has(id)){seen.add(id);order.push(id);}
 return order;
}
export function moveFolder(value:unknown,knownIds:readonly string[],id:string,direction:-1|1):string[] {
 const order=normalizeFolderOrder(value,knownIds);const from=order.indexOf(id),to=from+direction;
 if(from<0||to<0||to>=order.length)return order;
 [order[from],order[to]]=[order[to],order[from]];return order;
}
/** A drop moves the source to the target's position, keeping every other relative order. */
export function reorderFolder(value:unknown,knownIds:readonly string[],source:string,target:string):string[] {
 const order=normalizeFolderOrder(value,knownIds),from=order.indexOf(source),to=order.indexOf(target);
 if(from<0||to<0||from===to)return order;
 order.splice(from,1);order.splice(to,0,source);return order;
}
