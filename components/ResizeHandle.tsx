'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useOptionalAppearance } from './Appearance';
import { useT } from './I18n';
import { clampPane, PANE_MEDIA, PANES, paneKeyStep, paneLimit, type PaneId, type PaneSizes } from '../lib/pane-sizes';

type Props = {
  pane: PaneId;
  /** Untranslated accessible name, e.g. "Resize chat list". */
  label: string;
  /** Edge of the parent pane the handle sits on: 'end' = right edge (pane left of the handle). */
  edge: 'start' | 'end';
  /** Selector of the grid element that receives the CSS custom property (found with closest()). */
  container: string;
  /** Extra class, e.g. to hide the handle where the pane is an overlay. */
  className?: string;
  /**
   * 'inside' (default): the handle is a child of the pane. 'before': the handle is the pane's previous
   * sibling inside the grid (for panes that scroll/clip), positioned absolutely against the container.
   */
  anchor?: 'inside' | 'before';
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Width of the nearest rendered sibling on the handle's side; hidden launchers/scrims are skipped. */
function neighborOf(paneEl: HTMLElement, edge: 'start' | 'end') {
  let el = edge === 'end' ? paneEl.nextElementSibling : paneEl.previousElementSibling;
  while (el && !(el instanceof HTMLElement && el.getClientRects().length > 0 && !el.classList.contains('pane-handle'))) el = edge === 'end' ? el.nextElementSibling : el.previousElementSibling;
  return el as HTMLElement | null;
}

/**
 * Accessible vertical splitter. The parent element is the resizable pane; the width is written as a
 * CSS custom property on `container`, so the grid re-lays out without React re-rendering while dragging.
 */
export default function ResizeHandle(props: Props) {
  const appearance = useOptionalAppearance();
  return appearance ? <Handle {...props} paneSizes={appearance.paneSizes} setPaneSize={appearance.setPaneSize} /> : null;
}

function Handle({ pane, label, edge, container, className = '', anchor = 'inside', paneSizes, setPaneSize }: Props & { paneSizes: PaneSizes; setPaneSize: (id: PaneId, value: number | null) => void }) {
  const spec = PANES[pane];
  const t = useT();
  const stored = paneSizes[pane];
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<number | null>(null);
  const [limit, setLimit] = useState(spec.max);
  const drag = useRef<{ id: number; startX: number; startW: number; limit: number; next: number; x: number; frame: number } | null>(null);

  const parts = useCallback(() => {
    const handle = ref.current;
    const paneEl = ((anchor === 'before' ? handle?.nextElementSibling : handle?.parentElement) as HTMLElement | null | undefined) ?? null;
    const grid = handle?.closest<HTMLElement>(container) ?? null;
    return { handle, paneEl, grid, neighbor: paneEl ? neighborOf(paneEl, edge) : null };
  }, [anchor, container, edge]);

  const measure = useCallback(() => {
    const { handle, paneEl, grid, neighbor } = parts();
    if (!handle || !paneEl || !grid) return null;
    const paneRect = paneEl.getBoundingClientRect();
    const paneW = paneRect.width;
    if (anchor === 'before') {
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const x = (edge === 'start' ? paneRect.left : paneRect.right) - grid.getBoundingClientRect().left;
      handle.style.left = `${x + (edge === 'start' ? -gap / 2 : gap / 2) - 8}px`;
    }
    const neighborW = neighbor?.getBoundingClientRect().width ?? 0;
    return { handle, paneEl, grid, paneW, lim: paneLimit(spec, paneW, neighborW) };
  }, [anchor, edge, parts, spec]);

  /** Re-apply the stored width, clamped to the space available at the current viewport. */
  const sync = useCallback(() => {
    const { handle, grid } = parts();
    if (!handle || !grid) return;
    const desktop = window.matchMedia(PANE_MEDIA).matches;
    if (!desktop || stored === null) grid.style.removeProperty(spec.cssVar);
    if (!desktop || handle.getClientRects().length === 0) return;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    handle.style.setProperty('--pane-handle-offset', `${-(gap / 2) - 8}px`);
    let m = measure();
    if (stored !== null && m) {
      grid.style.setProperty(spec.cssVar, `${clampPane(spec, stored, m.lim)}px`);
      m = measure();
    }
    if (!m) return;
    setNow(Math.round(m.paneW));
    setLimit(clampPane(spec, spec.max, m.lim));
  }, [measure, parts, spec, stored]);

  useIsoLayoutEffect(() => { sync(); }, [sync]);
  useEffect(() => {
    let frame = 0;
    const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); };
  }, [sync]);
  useEffect(() => () => {
    if (drag.current) { cancelAnimationFrame(drag.current.frame); document.body.classList.remove('pane-resizing'); }
  }, []);

  const apply = () => {
    const d = drag.current; const { grid, handle } = parts();
    if (!d || !grid || !handle) return;
    d.frame = 0;
    const dir = edge === 'end' ? 1 : -1;
    d.next = clampPane(spec, d.startW + (d.x - d.startX) * dir, d.limit);
    grid.style.setProperty(spec.cssVar, `${d.next}px`);
    if (anchor === 'before') measure();
    handle.setAttribute('aria-valuenow', String(d.next));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = measure();
    if (!m) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, startW: m.paneW, limit: m.lim, next: Math.round(m.paneW), x: e.clientX, frame: 0 };
    document.body.classList.add('pane-resizing');
    e.currentTarget.dataset.dragging = '';
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.x = e.clientX;
    if (!d.frame) d.frame = requestAnimationFrame(apply);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    cancelAnimationFrame(d.frame);
    apply();
    drag.current = null;
    document.body.classList.remove('pane-resizing');
    delete e.currentTarget.dataset.dragging;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.abs(d.x - d.startX) >= 1) setPaneSize(pane, d.next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const m = measure();
    if (!m) return;
    const next = paneKeyStep(spec, m.paneW, e.key, e.shiftKey, edge === 'end' ? 'right' : 'left', m.lim);
    if (next === undefined) return;
    e.preventDefault();
    setPaneSize(pane, next);
  };

  return <div
    ref={ref}
    className={`pane-handle ${className}`}
    data-edge={edge}
    data-anchor={anchor}
    role="separator"
    aria-orientation="vertical"
    aria-label={t(label)}
    aria-valuemin={spec.min}
    aria-valuemax={limit}
    aria-valuenow={now ?? spec.min}
    tabIndex={0}
    title={t('Drag to resize. Double-click to reset.')}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={end}
    onPointerCancel={end}
    onLostPointerCapture={end}
    onDoubleClick={() => setPaneSize(pane, null)}
    onKeyDown={onKeyDown}
  />;
}
