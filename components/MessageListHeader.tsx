'use client';
import type {ReactNode} from 'react';
import {SquarePen} from 'lucide-react';
import {useT} from './I18n';
export default function MessageListHeader({modeSwitch,onNew,newLabel,disabled=false}:{modeSwitch?:ReactNode;onHome?:()=>void;onNew:()=>void;newLabel:string;disabled?:boolean}){
 const t=useT();
 return <div className="ms-list-heading"><div className="ms-title"><h1>{t('Messages')}</h1><button type="button" className="icon-button ms-show-m" onClick={onNew} disabled={disabled} aria-label={newLabel}><SquarePen size={22}/></button></div><div className="ms-mode-row">{modeSwitch}</div></div>;
}
