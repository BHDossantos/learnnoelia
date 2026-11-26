# Business agent (ported from Jennifer)

This folder is Jennifer's agent core, copied so this app can run the same business agent Jennifer runs. Source: github.com/BHDossantos/jennifer. Change it there first, then copy it here again.

- `core.ts`: the department agents, Jennifer's agent rules, the strict output envelope and `runBusinessTask`, which works one business task the way Jennifer's department shift does.
- `charter.ts`: this business's agent, with its tasks, guardrails, measures and the daily Claude routine it works alongside.
- `untrusted.ts`, `redaction.ts`, `claims.ts`: Jennifer's guards. Outside text is wrapped as untrusted data. Secrets are redacted from errors. Claims that something was paid, sent or signed are flagged.

The agent can only propose. Nothing here sends, posts, pays or writes. Every proposal comes back with `needsApproval: true`.

## Turning it on

`provider.ts` wires the agent to Claude and `src/app/api/admin/business-agent/route.ts` exposes it to admins only (everyone else gets a 404).

1. Set `ANTHROPIC_API_KEY` and `ADMIN_EMAILS` on the server (the app already uses both).
2. Set `BUSINESS_AGENT_ENABLED=true`. Without it the route answers 503 with the reason, and nothing calls the model.
3. `GET /api/admin/business-agent` shows the charter. `POST` with `{ "taskId": "prospects", "notes": "..." }` runs one task on this week's numbers plus any notes, and returns the proposals. Nothing is stored or sent.

`BUSINESS_AGENT_MODEL` overrides the model; it defaults to the app's `MODEL`.
