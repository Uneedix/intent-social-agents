'use client';
import { useT } from './I18n';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { ChevronDown, LogOut, UserPlus, UserCircle, Settings, Check, X } from 'lucide-react';
import { createClient } from '../lib/supabase/client';

/** Only e-mail addresses are remembered on this device — never passwords or tokens. */
const KEY = 'intent-known-accounts';
const readKnown = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 5) : []; } catch { return []; } };
const writeKnown = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 5))); } catch { /* storage blocked */ } };
export function rememberAccount(email?: string | null) { if (!email) return; writeKnown([email, ...readKnown().filter(e => e !== email)]); }

type Props = { avatar?: string; name?: string; onProfile?: () => void; onSettings?: () => void };

export default function AuthStatus({ avatar, name, onProfile, onSettings }: Props) {
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); if (data.user?.email) rememberAccount(data.user.email); setKnown(readKnown()); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const signOutTo = async (path: string) => { await createClient().auth.signOut(); window.location.assign(path); };
  const forget = (email: string) => { const next = readKnown().filter(e => e !== email); writeKnown(next); setKnown(next); };

  if (!ready) return <span className="acct-skel" aria-label="Checking session" />;
  if (!user) return <div className="auth-status"><Link href="/login">{t("Log in")}</Link><Link href="/register" className="auth-join">{t("Sign up")}</Link></div>;

  const email = user.email || '';
  const others = known.filter(e => e !== email);
  return <div className="acct" ref={box}>
    <button className="acct-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
      {avatar && <img src={avatar} alt="" />}<span className="acct-name">{name || email.split('@')[0]}</span><ChevronDown size={16} />
    </button>
    {open && <div className="acct-menu" role="menu">
      <div className="acct-head">{avatar && <img src={avatar} alt="" />}<div><b>{name || email.split('@')[0]}</b><small>{email}</small></div><Check size={16} /></div>
      {onProfile && <button role="menuitem" onClick={() => { setOpen(false); onProfile(); }}><UserCircle size={17} /> {t("View profile")}</button>}
      {onSettings && <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }}><Settings size={17} /> {t("Settings")}</button>}
      <p className="acct-label">{t("Switch account")}</p>
      {others.map(e => <div key={e} className="acct-row">
        <button role="menuitem" onClick={() => signOutTo('/login?email=' + encodeURIComponent(e))}><span className="acct-dot">{e[0]?.toUpperCase()}</span><span className="acct-mail">{e}</span></button>
        <button className="acct-x" aria-label={`Forget ${e} on this device`} onClick={() => forget(e)}><X size={14} /></button></div>)}
      <button role="menuitem" onClick={() => signOutTo('/login')}><UserPlus size={17} /> {t("Add another account")}</button>
      <small className="acct-note">{t("Switching asks for the other account’s password. Only e-mail addresses are remembered on this device.")}</small>
      <button role="menuitem" className="danger" onClick={() => signOutTo('/login')}><LogOut size={17} /> {t("Log out")}</button>
    </div>}
  </div>;
}
