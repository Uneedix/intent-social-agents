/** Layout preferences are untrusted persisted numbers; shrink rendered widths, not saved preferences. */
export function clampWidth(value: unknown, min: number, max: number, fallback: number): number {
  const lower = Number.isFinite(min) ? Math.max(0, min) : 0;
  const upper = Number.isFinite(max) ? Math.max(lower, max) : lower;
  const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(upper, Math.max(lower, Number.isFinite(candidate) ? candidate : lower)));
}
const widthOf = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
export function fitFeedWidths(container: number, preferredRail: unknown, navWidth = 286, gap = 32) {
  const width = widthOf(container);
  const navigation = clampWidth(navWidth, 0, 400, 286), spacing = clampWidth(gap, 0, 64, 32);
  const available = Math.max(0, width - navigation - spacing * 2);
  const enabled = width > 1050 && available >= 600;
  const rail = enabled ? clampWidth(preferredRail, 240, Math.min(520, available - 360), 325) : 0;
  return { rail, main: Math.max(0, available - rail), enabled };
}
export function fitChatWidths(container: number, preferredList: unknown, preferredInfo: unknown, showInfo: boolean) {
  const width = widthOf(container);
  if (width < 636) return { list: width, info: Math.min(300, width), conversation: width, inlineInfo: false, resizable: false };
  const inlineInfo = showInfo && width >= 892;
  const gaps = inlineInfo ? 32 : 16;
  const info = inlineInfo ? clampWidth(preferredInfo, 240, Math.min(400, width - 260 - 360 - gaps), 300) : Math.min(400, width);
  const list = clampWidth(preferredList, 260, Math.min(520, width - 360 - gaps - (inlineInfo ? info : 0)), 360);
  return { list, info, conversation: Math.max(360, width - list - gaps - (inlineInfo ? info : 0)), inlineInfo, resizable: true };
}
