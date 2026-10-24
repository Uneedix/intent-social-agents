'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';

type Identity = { user: User | null; scope: string };
const SessionContext = createContext<Identity>({ user: null, scope: 'guest' });
export const useSession = () => useContext(SessionContext);

/** Changing identity unmounts every account-specific component and pending UI draft. */
export default function SessionBoundary({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setIdentity({ user: null, scope: 'guest' }); return; }
    let active = true;
    const db = createClient();
    const apply = (user: User | null) => {
      if (active) { setError(''); setIdentity({ user, scope: user?.id || 'guest' }); }
    };
    const initialRevision = revision.current;
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      revision.current++;
      apply(session?.user || null);
    });
    db.auth.getUser().then(({ data, error: authError }) => {
      if (!active || revision.current !== initialRevision) return;
      if (authError && authError.name !== 'AuthSessionMissingError') {
        setError('Не удалось проверить сессию. Повторите попытку.');
        return;
      }
      apply(data.user);
    }).catch(() => { if (active) setError('Не удалось проверить сессию. Повторите попытку.'); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  if (!identity) return <main className="auth-page"><div role={error ? 'alert' : 'status'}>{error || 'Проверка сессии…'}{error && <button onClick={() => location.reload()}>Повторить</button>}</div></main>;
  return <SessionContext.Provider key={identity.scope} value={identity}>{children}</SessionContext.Provider>;
}
