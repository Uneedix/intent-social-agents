'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from './I18n';
import WidgetPanel from './WidgetPanel';
import ResizeHandle from './ResizeHandle';
import styles from './WidgetRail.module.css';
import FloatingWidgetLauncher from './FloatingWidgetLauncher';
import type {LauncherState} from '../lib/mobile-controls';

/** One mounted panel across breakpoints: hidden duplicate stores would overwrite edits. */
export default function WidgetRail({ header, launcher, onLauncherChange, onHide }: { header?: React.ReactNode; onHide?:()=>void; launcher:LauncherState; onLauncherChange:(state:LauncherState)=>void }) {
  const { lang } = useI18n();
  const label = lang === 'Русский' ? 'Мои виджеты' : lang === 'Polski' ? 'Moje widżety' : 'My widgets';
  const closeLabel = lang === 'Русский' ? 'Закрыть виджеты' : lang === 'Polski' ? 'Zamknij widżety' : 'Close widgets';
  const [open, setOpen] = useState(false);
  const rail = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1051px)');
    const resize = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!open || !rail.current) return;
    const node = rail.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = Array.from(node.parentElement?.children ?? []).filter((el): el is HTMLElement => el instanceof HTMLElement && el !== node && !el.hasAttribute('data-widget-overlay'));
    const inertBefore = siblings.map(el => el.inert);
    siblings.forEach(el => { el.inert = true; });
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')).filter(el => !el.hasAttribute('disabled') && !el.closest('[hidden]') && el.getClientRects().length > 0);
    (focusable()[0] ?? node).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); node.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    // React's nested catalog handles Escape/Tab at the app root first.
    // A listener on this aside would run before React and close both dialogs.
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      siblings.forEach((el, i) => { el.inert = inertBefore[i]; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  return <>
    <FloatingWidgetLauncher state={launcher} onChange={onLauncherChange} onOpen={()=>setOpen(true)}/>
    {open && <button type="button" data-widget-overlay className={styles.scrim} aria-label={closeLabel} onClick={() => setOpen(false)} tabIndex={-1} />}
    <aside id="feed-widgets" ref={rail} tabIndex={-1} className={`rightbar ${styles.rail} ${open ? styles.open : ''}`} aria-label={label} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}>
      <ResizeHandle pane="widgetRail" edge="start" container=".app" label="Resize widget panel" />
      <div className={styles.desktopHeader}>{header}</div>
      <div className={styles.mobileHeader}><strong>{label}</strong><button type="button" aria-label={closeLabel} onClick={() => setOpen(false)}><X size={20} /></button></div>
      <WidgetPanel onHide={onHide} />
    </aside>
  </>;
}
