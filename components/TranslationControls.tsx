'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Languages, X } from 'lucide-react';
import { useSession } from './SessionBoundary';
import { useI18n } from './I18n';
import { Modal, Button } from './ui';
import { TRANSLATION_LANGUAGES, translationBatches, type TranslationItem, type TranslationLanguage } from '../lib/translation';
import s from './TranslationControls.module.css';
import type {HistoryLoadResult} from '../lib/translation-history';
export type TranslationHistoryLoader={hasOlder:boolean;loading?:boolean;loadAll:(signal:AbortSignal)=>Promise<HistoryLoadResult>};

const errors:Record<string,[string,string]>={
 sign_in_required:['Sign in to use DeepL translation.','Войдите, чтобы использовать перевод DeepL.'],
 translation_not_configured:['DeepL is not connected yet. Add the server DEEPL_API_KEY setting to enable translation.','DeepL пока не подключён. Для перевода нужно добавить серверную настройку DEEPL_API_KEY.'],
 translation_rate_limit:['Translation limit reached. Try again later.','Достигнут лимит перевода. Повторите позже.'],
 translation_quota_exceeded:['The DeepL account translation quota is exhausted.','Квота перевода аккаунта DeepL исчерпана.'],
 translation_provider_auth:['The server DeepL connection needs attention.','Нужно проверить серверное подключение DeepL.'],
 translation_unavailable:['Translation is unavailable. Original messages are still shown.','Перевод недоступен. Оригиналы сообщений остаются на месте.'],
 authentication_unavailable:['Sign-in verification is temporarily unavailable.','Проверка входа временно недоступна.'],
 text_too_long:['One message is too long to translate safely.','Одно из сообщений превышает допустимую длину перевода.'],
};

/** Explicit consent is scoped to this open conversation; no message text or translation is persisted. */
export function useHistoryTranslation(conversation:string,items:TranslationItem[],history?:TranslationHistoryLoader):{toolbar:ReactNode;text:(id:string,text:string)=>ReactNode}{
 const {user,scope}=useSession();const {lang}=useI18n();const ru=lang==='Русский';const label=(en:string,rus:string)=>ru?rus:en;
 const key=scope+'|'+conversation;
 const [config,setConfig]=useState<{key:string;target:TranslationLanguage}|null>(null);
 const [open,setOpen]=useState(false),[consent,setConsent]=useState(false),[draft,setDraft]=useState<TranslationLanguage>('RU');
 const [original,setOriginal]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState(false),[historyComplete,setHistoryComplete]=useState(true);
 const historyRef=useRef(history);historyRef.current=history;const historyAbort=useRef<AbortController|null>(null);
 const [,redraw]=useState(0);const cache=useRef(new Map<string,string>());
 const encoded=JSON.stringify(items);const stableItems=useMemo(()=>JSON.parse(encoded) as TranslationItem[],[encoded]);
 const active=!!user&&config?.key===key;const target=active?config.target:null;
 const cacheKey=(id:string,text:string)=>JSON.stringify([key,target,id,text]);
 useEffect(()=>{cache.current.clear();setOpen(false);setConsent(false);setError('');setOriginal(false);setHistoryBusy(false);setHistoryError(false);setHistoryComplete(true);return()=>{historyAbort.current?.abort();};},[key]);
 useEffect(()=>{
  if(!active||!target||historyBusy){setBusy(false);return;}
  const controller=new AbortController();let current=true;
  const translate=async()=>{
   setError('');setBusy(true);
   try{
    const todo=stableItems.filter(x=>x.text.trim()&&!cache.current.has(JSON.stringify([key,target,x.id,x.text])));
    for(const batch of translationBatches(todo)){
     const response=await fetch('/api/translate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,items:batch}),signal:controller.signal,cache:'no-store'});
     const body=await response.json();if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'translation_unavailable');
     if(!Array.isArray(body.items)||body.items.length!==batch.length)throw new Error('translation_unavailable');
     for(let i=0;i<batch.length;i++){const row=body.items[i];if(row?.id!==batch[i].id||typeof row.text!=='string')throw new Error('translation_unavailable');}
     if(!current)return;
     for(let i=0;i<batch.length;i++)cache.current.set(JSON.stringify([key,target,batch[i].id,batch[i].text]),body.items[i].text);
     redraw(n=>n+1);
    }
   }catch(e){if(current&&!controller.signal.aborted)setError(e instanceof Error&&Object.hasOwn(errors,e.message)?e.message:'translation_unavailable');}
   finally{if(current)setBusy(false);}
  };
  void translate();return()=>{current=false;controller.abort();};
 },[active,target,key,stableItems,attempt,historyBusy]);
 const loadHistory=async()=>{
  historyAbort.current?.abort();const loader=historyRef.current;if(!loader?.hasOlder){setHistoryComplete(true);return;}
  const controller=new AbortController();historyAbort.current=controller;setHistoryBusy(true);setHistoryError(false);
  try{const result=await loader.loadAll(controller.signal);if(!controller.signal.aborted)setHistoryComplete(result.complete);}
  catch{if(!controller.signal.aborted){setHistoryError(true);setHistoryComplete(false);}}
  finally{if(historyAbort.current===controller&&!controller.signal.aborted)setHistoryBusy(false);}
 };
 const begin=()=>{if(!consent||!user)return;setConfig({key,target:draft});setOriginal(false);setOpen(false);setAttempt(n=>n+1);void loadHistory();};
 const stop=()=>{historyAbort.current?.abort();setHistoryBusy(false);setHistoryError(false);setConfig(null);setError('');cache.current.clear();};
 const langName=TRANSLATION_LANGUAGES.find(([id])=>id===target)?.[1];
 const toolbar=<div className={s.root}>
  <div className={s.row}>
   <button type="button" className={s.trigger} onClick={()=>{setConsent(false);setDraft(target||'RU');setOpen(true);}}><Languages size={17} aria-hidden="true"/>{active?label('Translation: ','Перевод: ')+langName:label('Translate history','Перевести историю')}</button>
   {active&&<><button type="button" className={s.link} onClick={()=>setOriginal(v=>!v)}>{original?label('Show translation','Показать перевод'):label('Show original','Показать оригинал')}</button><button type="button" className={s.close} onClick={stop} aria-label={label('Turn off translation','Выключить перевод')}><X size={16}/></button></>}
  </div>
  {active&&historyBusy&&<small role="status">{label('Loading the complete history… Stop translation to cancel.','Загрузка всей истории… Чтобы отменить, выключите перевод.')}</small>}
  {active&&!historyBusy&&!historyComplete&&<div className={s.note}>{label('A part of the history is loaded. Continue to include earlier messages.','Загружена часть истории. Продолжите, чтобы включить более ранние сообщения.')} <button type="button" className={s.link} onClick={()=>void loadHistory()}>{label('Continue loading history','Продолжить загрузку истории')}</button></div>}
  {active&&historyError&&<small role="alert">{label('Could not load earlier messages. Loaded messages can still be translated.','Не удалось загрузить ранние сообщения. Загруженные сообщения можно перевести.')}</small>}
  {active&&busy&&<small role="status">{label('Translating loaded messages…','Перевод загруженных сообщений…')}</small>}
  {active&&<small className={s.note}>{label('DeepL · history is loaded in pages; new messages are translated automatically.','DeepL · история загружается по страницам, новые сообщения переводятся автоматически.')}</small>}
  {active&&error&&<div className={s.error} role="alert">{errors[error]?.[ru?1:0]||errors.translation_unavailable[ru?1:0]} <button type="button" onClick={()=>setAttempt(n=>n+1)}>{label('Retry','Повторить')}</button></div>}
  {open&&<Modal title={label('Translate this conversation','Перевод этой беседы')} onClose={()=>setOpen(false)} width={520} footer={<><Button variant="outline" onClick={()=>setOpen(false)}>{label('Cancel','Отмена')}</Button><Button variant="primary" disabled={!consent||!user||!!history?.loading} onClick={begin}>{label('Enable translation','Включить перевод')}</Button></>}>
   <div className={s.dialog}>
    <label>{label('Translate into','Переводить на')}<select value={draft} onChange={e=>{setDraft(e.target.value as TranslationLanguage);setConsent(false);}}>{TRANSLATION_LANGUAGES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <p>{label('DeepL receives the text of this conversation’s complete history and newly received messages while translation is enabled. Files, photos and audio are not sent. Original messages are preserved.','Пока перевод включён, DeepL получает текст всей истории и новых сообщений этой беседы. Файлы, фото и аудио не отправляются. Оригиналы сохраняются.')}</p>
    <p>{label('Earlier history will load automatically in pages. Large histories may require continuing the next pass. Provider limits can pause translation. Translation can contain mistakes.','Ранняя история загрузится автоматически по страницам. Для большой истории может понадобиться продолжить следующий проход. Лимиты DeepL могут приостановить перевод. В переводе возможны ошибки.')}</p>
    {!user&&<p role="status"><a href="/login">{label('Sign in to use translation','Войдите, чтобы использовать перевод')}</a></p>}
    <label className={s.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{label('Send this conversation’s message text to DeepL for translation.','Передавать текст сообщений этой беседы в DeepL для перевода.')}</span></label>
   </div>
  </Modal>}
 </div>;
 return {toolbar,text:(id,text)=>{const translated=active&&!original?cache.current.get(cacheKey(id,text)):undefined;return translated===undefined?text:<><span>{translated}</span><small className={s.marker}>{label('Translated · DeepL','Переведено · DeepL')}</small></>;}};
}
