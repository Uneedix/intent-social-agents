'use client';
import { useT } from './I18n';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '../lib/supabase/client';
import { rememberAccount } from './AuthStatus';

type Mode = 'login' | 'register' | 'forgot-password' | 'reset-password';
export default function AuthForm({mode}:{mode:Mode}) {
  const t = useT();
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  useEffect(() => { const e = new URLSearchParams(window.location.search).get('email'); if (e && /^[^\s@]+@[^\s@]+$/.test(e)) setEmail(e.slice(0, 254)); }, []);
  const title = {login:'Welcome back',register:'Join intent.', 'forgot-password':'Reset your password', 'reset-password':'Choose a new password'}[mode];
  async function submit(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try {
      const supabase=createClient();
      if (mode==='register') {
        if(password.length<12) throw new Error('Use a password of at least 12 characters.');
        if(password!==confirm) throw new Error('Passwords do not match.');
        const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});
        if(error) throw error;
        setMessage(t('Check your email for a confirmation link. If this address already has an account, use Log in.'));
      } else if(mode==='login') {
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error) throw error;
        rememberAccount(email);
        window.location.assign('/');
      } else if(mode==='forgot-password') {
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/auth/callback?type=recovery`});
        if(error) throw error;
        setMessage(t('If this email is registered, you will receive a password reset link.'));
      } else {
        if(password.length<12) throw new Error('Use a password of at least 12 characters.');
        if(password!==confirm) throw new Error('Passwords do not match.');
        const {data:{user}}=await supabase.auth.getUser();
        if(!user) throw new Error('Reset link expired. Request a new one.');
        const {error}=await supabase.auth.updateUser({password});
        if(error) throw error;
        await supabase.auth.signOut();
        setMessage(t('Password updated. Please log in.'));
      }
    } catch(err) {setError(err instanceof Error ? t(err.message) : t('Something went wrong.'));}
    finally {setBusy(false);}
  }
  return <main className="auth-page"><div className="auth-card"><Link href="/" className="auth-logo">intent<span>.</span></Link><h1>{t(title)}</h1><p className="auth-subtitle">{t("People first. Content second.")}</p>
    <form onSubmit={submit}>
      {mode!=='reset-password'&&<label>{t("Email")}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>}
      {mode!=='forgot-password'&&<label>{t(mode==='reset-password'?'New password':'Password')}<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:12} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      {(mode==='register'||mode==='reset-password')&&<label>{t("Confirm password")}<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
      {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}
      <button className="auth-submit" disabled={busy} type="submit">{t(busy?'Please wait…':{login:'Log in',register:'Create account','forgot-password':'Send reset link','reset-password':'Save new password'}[mode])}</button>
    </form>
    <div className="auth-links">{mode==='login'?<><Link href="/forgot-password">{t("Forgot password?")}</Link><Link href="/register">{t("Create account")}</Link></>:<Link href="/login">{t("Back to log in")}</Link>}</div>
  </div></main>;
}
