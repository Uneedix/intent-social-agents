'use client';
import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Field, inputClass } from '../ui';
import { useT } from '../I18n';
import { errorText } from './model';
import s from './communities.module.css';

/** Render only for actual owner_id === authenticated user id, never membership role. */
export default function DeleteCommunityControl({ name, onDelete, onBusy }: {
  name: string; onDelete: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState(false), [typed, setTyped] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const remove = async () => {
    if (pending.current || typed !== name) return;
    pending.current = true; setBusy(true); onBusy(true); setError('');
    try { await onDelete(); }
    catch (e) { if (mounted.current) setError(t(errorText(e, 'Could not delete the community. Please retry.'))); }
    finally {
      pending.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  };
  return <section className={s.deleteZone} aria-label={t('Delete community')}>
    <h3>{t('Delete community')}</h3>
    <p>{t('This permanently deletes this community, its posts, channels, messages, memberships and join requests. This cannot be undone.')}</p>
    {!confirm ? <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> {t('Delete community')}</Button> : <>
      <Field label={t('Type {name} to confirm deletion.', { name })}>
        <input className={inputClass} value={typed} maxLength={100} autoComplete="off" disabled={busy} onChange={event => setTyped(event.target.value)} />
      </Field>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.deleteActions}>
        <Button variant="danger" disabled={busy || typed !== name} onClick={() => void remove()}>{t(busy ? 'Deleting community…' : 'Permanently delete community')}</Button>
        <Button disabled={busy} onClick={() => { setConfirm(false); setTyped(''); setError(''); }}>{t('Cancel')}</Button>
      </div>
      {busy && <p role="status">{t('Deletion is in progress. Please wait for server confirmation.')}</p>}
    </>}
  </section>;
}
