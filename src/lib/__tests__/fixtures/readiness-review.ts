/**
 * Synthetic, test-only lesson readiness review. Adapts Jennifer's
 * private-preparation review binding (reviewer, version, digest, expiration).
 * No runtime caller, approval authority, student data or route.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

const fixture = z.string().regex(/^fixture:[a-z][a-z0-9-]{0,47}$/).refine(v => !v.endsWith("\n"));
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshotSchema = z.strictObject({
  caseId: fixture,
  artifactVersion: z.number().int().positive(),
  practice: z.enum(["passed", "blocked"]),
  feedback: z.enum(["passed", "blocked"]),
});
const decisionSchema = z.strictObject({
  reviewer: fixture,
  caseId: fixture,
  artifactVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).length(64),
  expiresAt: time,
});

const denied = { state: "blocked", externalAction: false } as const;

export function prepareReviewFixture(raw: unknown) {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return denied;
  const { caseId, artifactVersion, practice, feedback } = parsed.data;
  const contentHash = createHash("sha256")
    .update(JSON.stringify(["learnnoelia-readiness-fixture-v1", caseId, artifactVersion, practice, feedback]))
    .digest("hex");
  return { state: "needs-review", caseId, artifactVersion, contentHash, externalAction: false } as const;
}

export function evaluateFixtureReview(raw: unknown, proof: unknown, expectedReviewer: unknown, now: unknown) {
  const packet = prepareReviewFixture(raw);
  const decision = decisionSchema.safeParse(proof);
  const reviewer = fixture.safeParse(expectedReviewer);
  const clock = time.safeParse(now);
  if (packet.state !== "needs-review" || !decision.success || !reviewer.success || !clock.success) return denied;
  const d = decision.data;
  if (d.reviewer !== reviewer.data || d.caseId !== packet.caseId ||
      d.artifactVersion !== packet.artifactVersion || d.contentHash !== packet.contentHash ||
      d.expiresAt <= clock.data) return denied;
  return { state: "reviewed-fixture", externalAction: false } as const;
}
