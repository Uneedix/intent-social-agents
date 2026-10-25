'use client';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import s from './ui.module.css';
import { useT } from '../I18n';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; block?: boolean; icon?: boolean };
/** The one button style for the whole app. */
export function Button({ variant = 'outline', size = 'md', block, icon, className = '', type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={[s.btn, s[variant], size !== 'md' && s[size], block && s.block, icon && s.iconBtn, className].filter(Boolean).join(' ')} {...rest} />;
}

/** Accessible modal (centered on desktop, bottom sheet on phones). Escape / backdrop closes; focus is trapped loosely and restored. */
export function Modal({ title, subtitle, onClose, children, footer, width = 520, steps }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; steps?: { total: number; current: number } }) {
  const t = useT(); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input,textarea,select,button:not([data-close])')?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={box} className={s.modal} role="dialog" aria-modal="true" style={{ ['--w' as string]: width + 'px' }}>
      <div className={s.head}><h2>{title}</h2><Button variant="ghost" icon data-close onClick={onClose} aria-label={t('Close')}><X size={20} /></Button></div>
      {subtitle && <p className={s.sub}>{subtitle}</p>}
      {steps && <div className={s.steps} aria-label={`${steps.current + 1}/${steps.total}`}>{Array.from({ length: steps.total }, (_, i) => <i key={i} className={i <= steps.current ? s.on : ''} />)}</div>}
      <div className={s.body}>{children}</div>
      {footer && <div className={s.foot}>{footer}</div>}
    </div>
  </div>;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <label className={s.field}>{label}{children}{hint && <span className={s.hint}>{hint}</span>}</label>;
}
export const inputClass = s.input;

export function Choice({ on, onClick, title, desc, icon }: { on: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; icon?: ReactNode }) {
  return <button type="button" role="radio" aria-checked={on} className={s.choice + (on ? ' ' + s.on : '')} onClick={onClick}>{icon}<span><b>{title}</b>{desc && <small>{desc}</small>}</span></button>;
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={s.toggle + (on ? ' ' + s.on : '')} onClick={() => onChange(!on)} />;
}

/** Dropdown menu anchored to its trigger. */
export function Menu({ trigger, items, align = 'right' }: { trigger: (open: boolean, toggle: () => void) => ReactNode; items: ({ label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean } | 'sep')[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', c); window.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', c); window.removeEventListener('keydown', k); }; }, [open]);
  return <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>{trigger(open, () => setOpen(!open))}
    {open && <div role="menu" className={s.menu} style={{ top: 'calc(100% + 6px)', [align]: 0 }}>{items.map((it, i) => it === 'sep' ? <div key={i} className={s.menuSep} /> :
      <button key={i} role="menuitem" className={s.menuItem + (it.danger ? ' ' + s.dangerItem : '')} onClick={() => { setOpen(false); it.onSelect(); }}>{it.icon}{it.label}</button>)}</div>}</div>;
}
