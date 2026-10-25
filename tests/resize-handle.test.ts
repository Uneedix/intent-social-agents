import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

test('resize handle supports keyboard bounds, captured drag lifecycle and cancellation without changing other pointers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const body = { style: { cursor: 'crosshair', userSelect: 'text' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } });
  const css = mock.module('../components/ResizeHandle.module.css', { cache: true, defaultExport: {} });
  const { default: ResizeHandle } = await import('../components/ResizeHandle');
  const captured = new Set<number>();
  const released: number[] = [];
  let focusCalls = 0, resets = 0;
  const target = {
    focus() { focusCalls++; },
    setPointerCapture(id: number) { captured.add(id); },
    hasPointerCapture(id: number) { return captured.has(id); },
    releasePointerCapture(id: number) { captured.delete(id); released.push(id); },
  };
  const changes: number[] = [];
  function Harness({ reverse = false, disabled = false }: { reverse?: boolean; disabled?: boolean }) {
    const [value, setValue] = useState(300);
    return createElement(ResizeHandle, {
      label: 'Resize test panel', value, min: 200, max: 500, step: 10, reverse, disabled,
      onChange: next => { changes.push(next); setValue(next); },
      onReset: () => { resets++; setValue(300); },
    });
  }
  let renderer: ReactTestRenderer | undefined;
  const handle = () => renderer!.root.findByProps({ role: 'separator' });
  const value = () => handle().props['aria-valuenow'];
  const key = async (key: string, shiftKey = false) => {
    let prevented = false;
    await act(async () => { handle().props.onKeyDown({ key, shiftKey, preventDefault() { prevented = true; } }); });
    return prevented;
  };
  const event = (pointerId: number, clientX: number, button = 0, isPrimary = true) => ({
    pointerId, clientX, button, isPrimary, currentTarget: target, preventDefault() {},
  });
  const pointer = async (handler: string, pointerId: number, x = 0, button = 0, isPrimary = true) => {
    await act(async () => { handle().props[handler](event(pointerId, x, button, isPrimary)); });
  };
  const assertRestored = () => {
    assert.deepEqual(body.style, { cursor: 'crosshair', userSelect: 'text' });
    assert.equal(captured.size, 0);
  };
  try {
    await act(async () => { renderer = create(createElement(Harness)); });
    assert.equal(handle().props['aria-label'], 'Resize test panel');
    assert.equal(handle().props['aria-orientation'], 'vertical');
    assert.equal(handle().props.tabIndex, 0);
    assert.equal(handle().props['aria-valuemin'], 200);
    assert.equal(handle().props['aria-valuemax'], 500);
    assert.equal(await key('ArrowRight'), true); assert.equal(value(), 310);
    await key('ArrowLeft'); assert.equal(value(), 300);
    await key('ArrowRight', true); assert.equal(value(), 340);
    await key('Home'); await key('ArrowLeft'); assert.equal(value(), 200);
    await key('End'); await key('ArrowRight', true); assert.equal(value(), 500);
    await key('Enter'); assert.equal(value(), 300); assert.equal(resets, 1);
    await act(async () => { handle().props.onDoubleClick(); }); assert.equal(resets, 2);
    assert.equal(await key('a'), false);

    await pointer('onPointerDown', 1, 100, 2); assert.equal(captured.size, 0);
    await pointer('onPointerDown', 1, 100, 0, false); assert.equal(captured.size, 0);
    await pointer('onPointerDown', 7, 100);
    assert.ok(captured.has(7)); assert.ok(focusCalls > 0);
    assert.deepEqual(body.style, { cursor: 'col-resize', userSelect: 'none' });
    await pointer('onPointerMove', 8, 200); assert.equal(value(), 300);
    await pointer('onPointerMove', 7, 160); assert.equal(value(), 360);
    await pointer('onPointerUp', 8, 160); assert.ok(captured.has(7));
    await pointer('onPointerCancel', 8, 160);
    assert.equal(value(), 360, 'an unrelated touch cancellation cannot revert the active pointer');
    assert.ok(captured.has(7));
    await pointer('onPointerUp', 7, 160); assert.equal(value(), 360); assertRestored();
    await pointer('onPointerMove', 7, 250); assert.equal(value(), 360, 'moves after pointer-up are ignored');

    await pointer('onPointerDown', 7, 200); await pointer('onPointerMove', 7, 270); assert.equal(value(), 430);
    assert.equal(await key('Escape'), true); assert.equal(value(), 360); assertRestored();
    await pointer('onPointerDown', 7, 300); await pointer('onPointerMove', 7, -100); assert.equal(value(), 200);
    await pointer('onPointerCancel', 7); assert.equal(value(), 360); assertRestored();
    await pointer('onPointerDown', 7, 0); await pointer('onPointerMove', 7, 1000); assert.equal(value(), 500);
    await pointer('onLostPointerCapture', 7); assert.equal(value(), 500); assertRestored();
    assert.ok(released.includes(7));

    await key('Enter');
    await act(async () => { renderer!.update(createElement(Harness, { reverse: true })); });
    await key('ArrowLeft'); assert.equal(value(), 310, 'reversed right panels grow when the handle moves left');
    await key('ArrowRight'); assert.equal(value(), 300);
    await pointer('onPointerDown', 3, 300); await pointer('onPointerMove', 3, 250); assert.equal(value(), 350);
    await pointer('onPointerUp', 3); assertRestored();
    const count = changes.length, resetCount = resets;
    await act(async () => { renderer!.update(createElement(Harness, { disabled: true })); });
    assert.equal(handle().props.tabIndex, -1); assert.equal(handle().props['aria-disabled'], true);
    await key('ArrowLeft'); await key('Home'); await key('Enter');
    await pointer('onPointerDown', 7, 0);
    await act(async () => { handle().props.onDoubleClick(); });
    assert.equal(changes.length, count); assert.equal(resets, resetCount); assert.equal(captured.size, 0);
    await act(async () => { renderer!.update(createElement(Harness)); });
    await pointer('onPointerDown', 7, 100);
    await act(async () => { renderer!.unmount(); }); renderer = undefined;
    assertRestored();
  } finally {
    await act(async () => { renderer?.unmount(); });
    css.restore(); Reflect.deleteProperty(globalThis, 'document');
  }
});
