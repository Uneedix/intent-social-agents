/** DeepL message translation contracts. No provider secrets belong in this client-safe module. */
export const TRANSLATION_LANGUAGES = [
 ['RU','Русский'],['EN-US','English'],['UK','Українська'],['PL','Polski'],['HU','Magyar'],['DE','Deutsch'],['FR','Français'],['ES','Español'],['IT','Italiano'],['PT-BR','Português'],['NL','Nederlands'],['JA','日本語'],['KO','한국어'],['ZH-HANS','简体中文'],
] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number][0];
export type TranslationItem = { id:string; text:string };
export const TRANSLATION_MAX_ITEMS = 50;
export const TRANSLATION_MAX_CHARACTERS = 20000;
export const TRANSLATION_MAX_TEXT = 10000;
export const TRANSLATION_MAX_BODY_BYTES = 100000;
export const isTranslationLanguage = (x:unknown):x is TranslationLanguage => typeof x==='string' && TRANSLATION_LANGUAGES.some(([id])=>id===x);
export function validateTranslationRequest(value:unknown): {target:TranslationLanguage;items:TranslationItem[]} | null {
 if(!value || typeof value!=='object' || Array.isArray(value)) return null;
 const v=value as Record<string,unknown>;
 if(!isTranslationLanguage(v.target)||!Array.isArray(v.items)||!v.items.length||v.items.length>TRANSLATION_MAX_ITEMS) return null;
 const items:TranslationItem[]=[];let count=0;const ids=new Set<string>();
 for(const row of v.items){
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const r=row as Record<string,unknown>;
  if(typeof r.id!=='string'||!r.id||r.id.length>160||ids.has(r.id)||typeof r.text!=='string'||!r.text.trim()||r.text.length>TRANSLATION_MAX_TEXT)return null;
  count+=r.text.length;if(count>TRANSLATION_MAX_CHARACTERS)return null;
  ids.add(r.id);items.push({id:r.id,text:r.text});
 }
 return {target:v.target,items};
}
/** Sequential, bounded batches preserve message order and skip empty attachment-only messages. */
export function translationBatches(items:TranslationItem[]):TranslationItem[][] {
 const out:TranslationItem[][]=[];let batch:TranslationItem[]=[];let chars=0;
 for(const item of items){if(!item.text.trim())continue;if(item.text.length>TRANSLATION_MAX_TEXT)throw new Error('text_too_long');
  if(batch.length && (batch.length>=TRANSLATION_MAX_ITEMS||chars+item.text.length>TRANSLATION_MAX_CHARACTERS)){out.push(batch);batch=[];chars=0;}
  batch.push(item);chars+=item.text.length;
 }
 if(batch.length)out.push(batch);return out;
}
