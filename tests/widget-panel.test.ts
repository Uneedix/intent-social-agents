import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { createWidget, LIMITS, type PanelState } from '../lib/widgets';
import { storageKey } from '../lib/storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const logicalKey = 'intent-widget-panel-v1';
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');

test('widget panel interactions preserve scoped data and catalog keyboard focus without unsafe links', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const storage = new MemoryStorage();
  const doc = new class extends EventTarget { activeElement: MockElement | null = null; }();
  let renderer: ReactTestRenderer | undefined;
  let scope = 'alice';
  const hostMocks = new WeakMap<object, MockElement>();
  class MockElement {
    isConnected = true;
    focus() { doc.activeElement = this; }
    querySelectorAll() {
      const dialog = renderer!.root.findByProps({ role: 'dialog' });
      return dialog.findAll(node => typeof node.type === 'string' &&
        ((['button', 'input', 'select'].includes(node.type) && !node.props.disabled) || (node.type === 'a' && node.props.href) || node.props.tabIndex === 0))
        .map(node => node.instance as MockElement);
    }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const mockedSession = mock.module('../components/SessionBoundary.tsx', { cache: true, namedExports: {
    useSession: () => ({ scope, user: { id: scope } }),
  } });
  const mockedCss = mock.module('../components/WidgetPanel.module.css', { cache: true,
    defaultExport: {},
  });
  const { default: WidgetPanel } = await import('../components/WidgetPanel');
  const aliceNote = createWidget('notes'); aliceNote.data.text = 'Alice private note';
  const aliceTasks = createWidget('tasks'); aliceTasks.data.items = [{ id: 'existing-task', text: 'Already completed', done: true }];
  const bobNote = createWidget('notes'); bobNote.data.text = 'Bob private note';
  const initialAlice: PanelState = { version: 1, widgets: [aliceNote, aliceTasks] };
  storage.setItem(storageKey('alice', logicalKey), JSON.stringify(initialAlice));
  storage.setItem(storageKey('bob', logicalKey), JSON.stringify({ version: 1, widgets: [bobNote] }));
  const saved = (identity = scope): PanelState => JSON.parse(storage.getItem(storageKey(identity, logicalKey))!);
  const labeled = (label: string) => renderer!.root.findByProps({ 'aria-label': label });
  const button = (label: string, within: ReactTestInstance = renderer!.root) => {
    const found = within.findAllByType('button').find(item => item.props['aria-label'] === label || text(item) === label);
    assert.ok(found, `Missing button: ${label}`); return found;
  };
  const click = async (label: string, within?: ReactTestInstance) => { await act(async () => { button(label, within).props.onClick(); }); };
  const change = async (label: string, value: string) => { await act(async () => { labeled(label).props.onChange({ target: { value } }); }); };
  const open = async () => {
    const opener = button('Add widget'); const node = opener.instance as MockElement; node.focus();
    await act(async () => { opener.props.onClick(); });
    return node;
  };
  try {
    await act(async () => { renderer = create(createElement(WidgetPanel, { key: scope }), {
      createNodeMock: element => {
        let node = hostMocks.get(element.props as object);
        if (!node) { node = new MockElement(); hostMocks.set(element.props as object, node); }
        return node;
      },
    }); });
    assert.equal(labeled('Your note').props.value, 'Alice private note');
    await change('Your note', 'Alice edited note');
    await click('Move Notes down');
    assert.deepEqual(saved().widgets.map(item => item.type), ['tasks', 'notes']);
    assert.equal(saved().widgets.find(item => item.type === 'notes')?.data.text, 'Alice edited note');
    assert.deepEqual(saved().widgets.find(item => item.type === 'tasks')?.data.items, aliceTasks.data.items);
    await click('Collapse Notes');
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'Your note' }).length, 0);
    await click('Expand Notes');
    assert.equal(labeled('Your note').props.value, 'Alice edited note');

    const opener = await open();
    let dialog = renderer!.root.findByProps({ role: 'dialog' });
    assert.equal(dialog.props['aria-modal'], 'true');
    assert.equal(doc.activeElement, labeled('Search widgets').instance, 'library moves focus to search');
    const focusable = (dialog.instance as MockElement).querySelectorAll();
    const first = focusable[0], last = focusable.at(-1)!;
    last.focus(); let prevented = false;
    await act(async () => { dialog.props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } }); });
    assert.equal(prevented, true); assert.equal(doc.activeElement, first, 'Tab stays inside dialog');
    first.focus(); prevented = false;
    await act(async () => { dialog.props.onKeyDown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } }); });
    assert.equal(prevented, true); assert.equal(doc.activeElement, last, 'Shift+Tab wraps inside dialog');
    await change('Search widgets', 'quick');
    dialog = renderer!.root.findByProps({ role: 'dialog' });
    const quickLink = dialog.findAllByType('button').find(item => item.findAllByType('strong').some(title => text(title) === 'Quick links'));
    assert.ok(quickLink); assert.equal(quickLink.props.type, 'button');
    await act(async () => { quickLink.props.onClick(); });
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(doc.activeElement, opener, 'closing after catalog activation restores opener focus');
    assert.ok(saved().widgets.some(item => item.type === 'links'));
    await change('Link name', 'Research');
    await change('Link URL', 'javascript:alert(1)');
    const linkForm = () => labeled('Link name').parent!;
    await act(async () => { linkForm().props.onSubmit({ preventDefault() {} }); });
    assert.equal(saved().widgets.find(item => item.type === 'links')?.data.items.length, 0);
    assert.ok(renderer!.root.findAllByProps({ role: 'alert' }).length > 0);
    await change('Link URL', 'https://example.com/research');
    await act(async () => { linkForm().props.onSubmit({ preventDefault() {} }); });
    const link = renderer!.root.findByProps({ href: 'https://example.com/research' });
    assert.equal(link.props.target, '_blank');
    assert.ok(link.props.rel.includes('noopener') && link.props.rel.includes('noreferrer'));
    assert.equal(saved().widgets.find(item => item.type === 'links')?.data.items.length, 1);

    await open();
    dialog = renderer!.root.findByProps({ role: 'dialog' });
    await click('Student', dialog);
    assert.equal(saved().widgets.find(item => item.type === 'notes')?.data.text, 'Alice edited note');
    assert.deepEqual(saved().widgets.find(item => item.type === 'tasks')?.data.items, aliceTasks.data.items);
    await act(async () => { dialog.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); });
    assert.equal(renderer!.root.findAllByProps({ role: 'dialog' }).length, 0);
    await click('Remove Quick links');
    assert.equal(saved().widgets.some(item => item.type === 'links'), true, 'requesting removal preserves data until confirmation');
    await click('Remove widget');
    assert.equal(saved().widgets.some(item => item.type === 'links'), false);
    const aliceSnapshot = storage.getItem(storageKey('alice', logicalKey));
    scope = 'bob';
    await act(async () => { renderer!.update(createElement(WidgetPanel, { key: scope })); });
    assert.equal(labeled('Your note').props.value, 'Bob private note');
    await change('Your note', 'Bob edited note');
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), aliceSnapshot, 'another account cannot overwrite Alice widgets');
    scope = 'guest';
    storage.setItem(storageKey('guest', logicalKey), JSON.stringify({ version: 1, widgets: [
      { id: '<invalid-note-id>', type: 'notes', data: { text: { malformed: true } } },
      { id: 'unknown', type: 'script', data: { html: '<script>evil</script>' } },
    ] }));
    await act(async () => { renderer!.update(createElement(WidgetPanel, { key: scope })); });
    assert.equal(labeled('Your note').props.value, '', 'damaged persisted content renders a safe note');
    await change('Your note', 'n'.repeat(LIMITS.notes + 50));
    assert.equal(saved().widgets.find(item => item.type === 'notes')?.data.text.length, LIMITS.notes);
    await click('Remove Notes');
    await click('Remove widget');
    assert.deepEqual(saved().widgets, []);
    await act(async () => { renderer!.unmount(); }); renderer = undefined;
    await act(async () => { renderer = create(createElement(WidgetPanel, { key: scope })); });
    assert.equal(renderer!.root.findAllByType('article').length, 0, 'deliberately empty layouts stay empty after remount');
  } finally {
    await act(async () => { renderer?.unmount(); });
    mockedCss.restore(); mockedSession.restore();
    for (const key of ['document', 'window', 'localStorage']) Reflect.deleteProperty(globalThis, key);
  }
});
