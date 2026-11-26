import { describe, expect, it } from 'vitest';
import { agentOffReason, anthropicProvider, isAgentAdmin, providerFromEnv } from './provider';
import { runBusinessTask } from './core';
import { BUSINESS_AGENTS } from './charter';

const okEnvelope = {
  status: 'completed',
  summary: 's',
  data: { headline: 'h', skillsUsed: [], findings: [], proposals: [{ kind: 'draft', skillId: 'copy', title: 't', detail: 'd', sourceId: 'app:metrics' }], questions: [], notesForNextShift: '' },
  sources: [{ sourceId: 'app:metrics', locator: '', note: '' }],
  assumptions: [],
  proposed_actions: [],
  blockers: [],
};

describe('business agent wiring', () => {
  it('stays off without the flag or the key', () => {
    expect(agentOffReason({})).toMatch(/BUSINESS_AGENT_ENABLED/);
    expect(agentOffReason({ BUSINESS_AGENT_ENABLED: 'true' })).toMatch(/ANTHROPIC_API_KEY/);
    expect(agentOffReason({ BUSINESS_AGENT_ENABLED: 'true', ANTHROPIC_API_KEY: 'k' })).toBeNull();
    expect(providerFromEnv({ ANTHROPIC_API_KEY: 'k' })).toBeUndefined();
  });

  it('lets only listed admins run it', () => {
    const env = { ADMIN_EMAILS: 'Owner@Example.com, two@example.com' };
    expect(isAgentAdmin('owner@example.com', env)).toBe(true);
    expect(isAgentAdmin('someone@example.com', env)).toBe(false);
    expect(isAgentAdmin('owner@example.com', {})).toBe(false);
    expect(isAgentAdmin(undefined, env)).toBe(false);
  });

  it('turns the forced tool call into the envelope and every proposal still needs approval', async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', input: okEnvelope }] }) };
    }) as unknown as typeof fetch;
    const agent = BUSINESS_AGENTS[0];
    const result = await runBusinessTask({
      agent,
      taskId: agent.tasks[0].id,
      evidence: [{ sourceId: 'app:metrics', trusted: true, text: 'Signups this week: 3' }],
      model: anthropicProvider({ apiKey: 'k', fetchImpl: fakeFetch }),
    });
    expect((sent.tool_choice as { type: string }).type).toBe('tool');
    expect(result.status).toBe('completed');
    expect(result.proposals.every((p) => p.needsApproval)).toBe(true);
  });

  it('reports a failed model call without leaking the key', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    const agent = BUSINESS_AGENTS[0];
    const result = await runBusinessTask({
      agent,
      taskId: agent.tasks[0].id,
      evidence: [{ sourceId: 'app:metrics', trusted: true, text: 'x' }],
      model: anthropicProvider({ apiKey: 'sk-ant-secret', fetchImpl: fakeFetch }),
    });
    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret');
  });
});
