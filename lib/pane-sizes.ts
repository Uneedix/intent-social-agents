/**
 * Resizable desktop panes. Sizes are pure numbers (px) so they can be validated,
 * clamped and tested without a DOM. `null` means "use the CSS default".
 * Persisted per account through `useStored` (scoped key `intent-pane-sizes`).
 */
export type PaneId = 'chatList' | 'chatSide' | 'widgetRail' | 'groupList';
export type PaneSpec = {
  id: PaneId;
  /** CSS custom property set on the grid container. */
  cssVar: string;
  min: number;
  max: number;
  /** Smallest width the neighbouring flexible column may be squeezed to. */
  neighborMin: number;
  step: number;
  bigStep: number;
};
export type PaneSizes = Record<PaneId, number | null>;

export const PANE_STORAGE_KEY = 'intent-pane-sizes';
/** Resizing is a desktop feature; phones and tablets keep their fixed layouts. */
export const PANE_MEDIA = '(min-width: 1051px)';

export const PANES: Record<PaneId, PaneSpec> = {
  chatList: { id: 'chatList', cssVar: '--pane-chat-list', min: 320, max: 560, neighborMin: 380, step: 16, bigStep: 64 },
  chatSide: { id: 'chatSide', cssVar: '--pane-chat-side', min: 260, max: 420, neighborMin: 380, step: 16, bigStep: 64 },
  widgetRail: { id: 'widgetRail', cssVar: '--pane-rail', min: 280, max: 520, neighborMin: 520, step: 16, bigStep: 64 },
  groupList: { id: 'groupList', cssVar: '--pane-group-list', min: 200, max: 420, neighborMin: 320, step: 16, bigStep: 64 },
};

export const DEFAULT_PANE_SIZES: PaneSizes = { chatList: null, chatSide: null, widgetRail: null, groupList: null };

/**
 * Clamp to the pane's own range and to `limit` (space left after the neighbour keeps its minimum).
 * The pane minimum always wins over the limit so content never collapses below its designed width.
 */
export function clampPane(spec: PaneSpec, value: number, limit = Infinity): number {
  const max = Math.max(spec.min, Number.isNaN(limit) ? spec.max : Math.min(spec.max, limit));
  const safe = Number.isFinite(value) ? value : spec.min;
  return Math.round(Math.min(max, Math.max(spec.min, safe)));
}

/** Largest width allowed now, from the measured pane + neighbour widths. */
export function paneLimit(spec: PaneSpec, paneWidth: number, neighborWidth: number): number {
  if (!Number.isFinite(paneWidth) || !Number.isFinite(neighborWidth) || neighborWidth <= 0) return spec.max;
  return Math.floor(paneWidth + neighborWidth - spec.neighborMin);
}

/** Accept only known panes holding null or an in-range finite number; anything else falls back to default. */
export function sanitizePaneSizes(raw: unknown): PaneSizes {
  const result: PaneSizes = { ...DEFAULT_PANE_SIZES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const id of Object.keys(PANES) as PaneId[]) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === 'number' && Number.isFinite(value)) result[id] = clampPane(PANES[id], value);
  }
  return result;
}

export function withPaneSize(sizes: PaneSizes, id: PaneId, value: number | null): PaneSizes {
  return { ...sanitizePaneSizes(sizes), [id]: value === null ? null : clampPane(PANES[id], value) };
}

export function hasCustomPaneSizes(sizes: PaneSizes): boolean {
  return (Object.keys(PANES) as PaneId[]).some(id => sizes[id] !== null);
}

/**
 * Keyboard model for a vertical separator. `growsTo` is the arrow direction that widens the pane
 * ('right' for a pane left of its handle, 'left' for a pane right of it).
 * Returns the new width, `null` to reset to default, or `undefined` when the key is not handled.
 */
export function paneKeyStep(spec: PaneSpec, current: number, key: string, shift: boolean, growsTo: 'left' | 'right', limit = Infinity): number | null | undefined {
  const step = shift ? spec.bigStep : spec.step;
  if (key === 'Enter') return null;
  if (key === 'Home') return clampPane(spec, spec.min, limit);
  if (key === 'End') return clampPane(spec, spec.max, limit);
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined;
  const grow = (key === 'ArrowRight') === (growsTo === 'right');
  return clampPane(spec, current + (grow ? step : -step), limit);
}
