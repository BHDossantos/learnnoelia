import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TranslateClient } from './TranslateClient';
let tree: ReactTestRenderer;
const response = (translation: string) => ({ ok: true, json: async () => ({ translation, alternatives: [], notes: '', detectedSource: 'en' }) });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); act(() => { tree = create(React.createElement(TranslateClient)); }); });
afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });
function edit(value: string) { act(() => tree.root.findByType('textarea').props.onChange({ target: { value } })); }
function button(label: string) { return tree.root.findAllByType('button').find(b => b.children.includes(label))!; }
it('keeps input and provides retry after a rejected network request', async () => {
 edit('hello'); vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
 await act(async () => { await button('Translate').props.onClick(); });
 expect(tree.root.findByType('textarea').props.value).toBe('hello');
 expect(JSON.stringify(tree.toJSON())).toContain('Could not connect');
 expect(button('Translate').props.disabled).toBe(false);
});
it('ignores an obsolete translation after the user edits text', async () => {
 let resolve!: (r: any) => void;
 vi.mocked(fetch).mockReturnValue(new Promise(r => { resolve = r; }));
 edit('old'); let pending: Promise<void>;
 act(() => { pending = button('Translate').props.onClick(); });
 edit('new');
 await act(async () => { resolve(response('obsolete')); await pending; });
 expect(JSON.stringify(tree.toJSON())).not.toContain('obsolete');
 expect(tree.root.findByType('textarea').props.value).toBe('new');
});
it('swaps a detected language with its result and clears stale output', async () => {
 edit('hello'); vi.mocked(fetch).mockResolvedValue(response('hola') as Response);
 await act(async () => { await button('Translate').props.onClick(); });
 act(() => button('Swap languages').props.onClick());
 expect(tree.root.findByType('textarea').props.value).toBe('hola');
 expect(tree.root.findAllByType('select').map(s => s.props.value)).toEqual(['es', 'en']);
 expect(tree.root.findAllByProps({ 'aria-label': 'Listen to translation' })).toHaveLength(0);
});
