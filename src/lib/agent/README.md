# Business agent (ported from Jennifer)

This folder is Jennifer's agent core, copied so this app can run the same business agent Jennifer runs. Source: github.com/BHDossantos/jennifer. Change it there first, then copy it here again.

- `core.ts`: the department agents, Jennifer's agent rules, the strict output envelope and `runBusinessTask`, which works one business task the way Jennifer's department shift does.
- `charter.ts`: this business's agent, with its tasks, guardrails, measures and the daily Claude routine it works alongside.
- `untrusted.ts`, `redaction.ts`, `claims.ts`: Jennifer's guards. Outside text is wrapped as untrusted data. Secrets are redacted from errors. Claims that something was paid, sent or signed are flagged.

The agent can only propose. Nothing here sends, posts, pays or writes. Every proposal comes back with `needsApproval: true`, and nothing is wired to a page or an API route yet.

To turn it on, the app needs a server-side AI key and a `ModelProvider` that calls the model. Until then `runBusinessTask` returns `blocked` with "Add an AI key on the server to turn this agent on".
