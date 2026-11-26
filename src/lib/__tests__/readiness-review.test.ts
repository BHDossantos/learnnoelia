import { describe, expect, it } from "vitest";
import { evaluateFixtureReview, prepareReviewFixture } from "./fixtures/readiness-review";

const snapshot = { caseId: "fixture:lesson-a", artifactVersion: 1, practice: "passed", feedback: "blocked" };
const packet = prepareReviewFixture(snapshot);
if (packet.state !== "needs-review") throw new Error("invalid test fixture");
const reviewer = "fixture:reviewer";
const proof = { reviewer, caseId: packet.caseId, artifactVersion: packet.artifactVersion, contentHash: packet.contentHash, expiresAt: 200 };
const blocked = { state: "blocked", externalAction: false };

describe("synthetic lesson readiness review", () => {
  it("binds the exact fixture and returns no external authorization", () => {
    expect(evaluateFixtureReview(snapshot, proof, reviewer, 199))
      .toEqual({ state: "reviewed-fixture", externalAction: false });
    expect(prepareReviewFixture(snapshot)).toEqual(packet);
  });

  it("rejects changed findings, versions, reviewer, case and expiration", () => {
    for (const input of [{ ...snapshot, feedback: "passed" }, { ...snapshot, artifactVersion: 2 }, { ...snapshot, caseId: "fixture:lesson-b" }])
      expect(evaluateFixtureReview(input, proof, reviewer, 199)).toEqual(blocked);
    expect(evaluateFixtureReview(snapshot, proof, "fixture:someone-else", 199)).toEqual(blocked);
    expect(evaluateFixtureReview(snapshot, proof, reviewer, 200)).toEqual(blocked);
  });

  it("rejects unexpected fields, nonfixture identifiers and invalid clock values", () => {
    expect(prepareReviewFixture({ ...snapshot, learner: "fixture:person" })).toEqual(blocked);
    expect(prepareReviewFixture({ ...snapshot, caseId: "case:lesson-a" })).toEqual(blocked);
    expect(evaluateFixtureReview(snapshot, { ...proof, publish: true }, reviewer, 199)).toEqual(blocked);
    expect(evaluateFixtureReview(snapshot, proof, reviewer, NaN)).toEqual(blocked);
  });
});
