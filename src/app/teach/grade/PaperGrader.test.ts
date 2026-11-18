import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ children, href }: any) => React.createElement('a', { href }, children) }));
import { PaperGrader } from './PaperGrader';
afterEach(() => vi.unstubAllGlobals());
it('previews a PDF by name and submits it as a document, not an image', async () => {
  vi.stubGlobal('FileReader', class { result = 'data:application/pdf;base64,JVBERi0xLjQ='; onload: (() => void) | null = null; readAsDataURL() { this.onload?.(); } });
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'paper', grade: { score: 50, max_score: 100 } }) }); vi.stubGlobal('fetch', fetch);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(React.createElement(PaperGrader, { students: [{ id: 'student', name: 'Example Student' }] })); });
  act(() => tree.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [new File(['%PDF-1.4'], 'biology.pdf', { type: 'application/pdf' })] } }));
  expect(tree.root.findAllByType('img')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('biology.pdf');
  await act(async () => { await tree.root.findAllByType('button').find(b => b.props.children === 'Grade & notify')!.props.onClick(); });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.document.media_type).toBe('application/pdf'); expect(body.image).toBeUndefined();
  expect(JSON.stringify(tree.toJSON())).toContain('50'); act(() => tree.unmount());
});
it('rejects unsupported or oversized files before trying to read or grade them', () => {
  let tree!: ReactTestRenderer; act(() => { tree = create(React.createElement(PaperGrader, { students: [{ id: 'student', name: 'Example' }] })); });
  for (const file of [{ type: 'application/zip', size: 50 }, { type: 'application/pdf', size: 4 * 1024 * 1024 }]) {
    act(() => tree.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [file] } }));
    expect(tree.root.findAllByProps({ role: 'alert' })).toHaveLength(1);
    expect(tree.root.findAllByType('button').find(b => b.props.children === 'Grade & notify')!.props.disabled).toBe(true);
  }
  act(() => tree.unmount());
});
