'use client';
import { useT } from './I18n';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LogOut, UserPlus, UserCircle, Settings, Check, X, LayoutGrid } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';
import {useSession} from './SessionBoundary';

/** Only e-mail addresses are remembered on this device — never passwords or tokens. */
const KEY = 'intent-known-accounts';
const readKnown = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : []; } catch { return []; } };
const writeKnown = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 5))); } catch { /* storage blocked */ } };
export function rememberAccount(email?: string | null) { if (!email) return; writeKnown([email, ...readKnown().filter(e => e !== email)]); }

type Props = { avatar?: string; name?: string; onProfile?: () => void; onSettings?: () => void; onRestoreWidgets?:()=>void };

export default function AuthStatus({ avatar, name, onProfile, onSettings, onRestoreWidgets }: Props) {
  const t = useT();
  const {user} = useSession();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if(user?.email)rememberAccount(user.email);setKnown(readKnown()); },[user?.email]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const signOutTo = async (path: string) => {
    if(busy)return;setBusy(true);setError('');
    try { if(!isSupabaseConfigured())throw new Error('Supabase is not configured.');const {error}=await createClient().auth.signOut();if(error)throw error;window.location.assign(path); }
    catch(e){setError(e instanceof Error?e.message:t('Could not sign out.'));setBusy(false);}
  };
  const forget = (email: string) => { const next = readKnown().filter(e => e !== email); writeKnown(next); setKnown(next); };

  const restoreAction=onRestoreWidgets&&<button role="menuitem" onClick={()=>{setOpen(false);onRestoreWidgets();}}><LayoutGrid size={17}/>{t('Restore widgets button')}</button>;
  if (!user) return <div className="auth-status acct" ref={box}><Link href="/login">{t("Log in")}</Link><Link href="/register" className="auth-join">{t("Sign up")}</Link><button className="icon-button" aria-label={t('Profile options')} aria-expanded={open} onClick={()=>setOpen(!open)}><UserCircle size={23}/></button>{open&&<div className="acct-menu" role="menu">{onProfile&&<button role="menuitem" onClick={()=>{setOpen(false);onProfile();}}><UserCircle size={17}/>{t('View profile')}</button>}{restoreAction}</div>}</div>;

  const email = user.email || '';
  const others = known.filter(e => e !== email);
  return <div className="acct" ref={box}>
    <button className="acct-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
      {avatar && <img src={avatar} alt="" />}<span className="acct-name">{name || email.split('@')[0]}</span><ChevronDown size={16} />
    </button>
    {open && <div className="acct-menu" role="menu">
      {error&&<p role="alert">{error}</p>}
      <div className="acct-head">{avatar && <img src={avatar} alt="" />}<div><b>{name || email.split('@')[0]}</b><small>{email}</small></div><Check size={16} /></div>
      {onProfile && <button role="menuitem" onClick={() => { setOpen(false); onProfile(); }}><UserCircle size={17} /> {t("View profile")}</button>}
      {onSettings && <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }}><Settings size={17} /> {t("Settings")}</button>}
      {restoreAction}
      <p className="acct-label">{t("Switch account")}</p>
      {others.map(e => <div key={e} className="acct-row">
        <button role="menuitem" disabled={busy} onClick={() => signOutTo('/login?email=' + encodeURIComponent(e))}><span className="acct-dot">{e[0]?.toUpperCase()}</span><span className="acct-mail">{e}</span></button>
        <button className="acct-x" aria-label={`Forget ${e} on this device`} onClick={() => forget(e)}><X size={14} /></button></div>)}
      <button role="menuitem" disabled={busy} onClick={() => signOutTo('/login')}><UserPlus size={17} /> {t("Add another account")}</button>
      <small className="acct-note">{t("Switching asks for the other account’s password. Only e-mail addresses are remembered on this device.")}</small>
      <button role="menuitem" className="danger" disabled={busy} onClick={() => signOutTo('/login')}><LogOut size={17} /> {t("Log out")}</button>
    </div>}
  </div>;
}
