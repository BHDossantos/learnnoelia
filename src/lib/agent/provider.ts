import type { ModelProvider } from './core';

/**
 * Wiring for the business agent. It stays off until the server has both an
 * AI key and BUSINESS_AGENT_ENABLED=true, and only admins can run it.
 * The agent only proposes: nothing here sends, posts, pays or writes.
 */

type Env = Record<string, string | undefined>;

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Why the agent is off, or null when it can run. */
export function agentOffReason(env: Env = process.env): string | null {
  if (env.BUSINESS_AGENT_ENABLED !== 'true') return 'Set BUSINESS_AGENT_ENABLED=true on the server to turn the business agent on.';
  if (!env.ANTHROPIC_API_KEY) return 'Add ANTHROPIC_API_KEY on the server to turn the business agent on.';
  return null;
}

/** Admins are the comma-separated emails in ADMIN_EMAILS. No list means nobody. */
export function isAgentAdmin(email: string | null | undefined, env: Env = process.env): boolean {
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(email.trim().toLowerCase());
}

/**
 * A ModelProvider on the Claude Messages API. The schema is passed as the only
 * tool and the model is made to call it, so the reply is the JSON the schema asks for.
 */
export function anthropicProvider(opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): ModelProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async complete(req) {
      const res = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: opts.model || DEFAULT_MODEL,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.input }],
          tools: [{ name: req.jsonSchema.name.slice(0, 64), description: 'Return the shift result.', input_schema: req.jsonSchema.schema }],
          tool_choice: { type: 'tool', name: req.jsonSchema.name.slice(0, 64) },
        }),
      });
      if (!res.ok) throw new Error(`model call failed with status ${res.status}`);
      const body = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
      const call = body.content?.find((c) => c.type === 'tool_use');
      if (!call) throw new Error('model returned no result');
      return { text: JSON.stringify(call.input) };
    },
  };
}

/** The provider when the agent is on, otherwise undefined (runBusinessTask then returns blocked). */
export function providerFromEnv(env: Env = process.env, fetchImpl?: typeof fetch): ModelProvider | undefined {
  if (agentOffReason(env)) return undefined;
  return anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY as string, model: env.BUSINESS_AGENT_MODEL, fetchImpl });
}
