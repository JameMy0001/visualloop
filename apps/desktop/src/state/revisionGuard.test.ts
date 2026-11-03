import { describe, expect, it } from "vitest";
import type { ActiveArtifactInfo } from "../services/coreClient";
import { isOlderRevision, isSameReviewSnapshot } from "./revisionGuard";

const revisionOne: ActiveArtifactInfo = {
  sessionId: "session-1",
  artifactId: "artifact-1",
  revision: 1,
  kind: "svg",
  entrypoint: "/app/preview.svg",
  content: "<svg><rect /></svg>",
};

describe("review revision guard", () => {
  it("recognizes an unchanged review snapshot", () => {
    expect(isSameReviewSnapshot(revisionOne, { ...revisionOne })).toBe(true);
  });

  it("detects changed content even when the revision number stays the same", () => {
    expect(
      isSameReviewSnapshot(revisionOne, {
        ...revisionOne,
        content: "<svg><circle /></svg>",
      }),
    ).toBe(false);
  });

  it("detects new revisions and different artifacts", () => {
    expect(isSameReviewSnapshot(revisionOne, { ...revisionOne, revision: 2 })).toBe(false);
    expect(isSameReviewSnapshot(revisionOne, { ...revisionOne, artifactId: "other" })).toBe(false);
  });

  it("rejects delayed older revisions of the same artifact", () => {
    expect(isOlderRevision({ ...revisionOne, revision: 3 }, revisionOne)).toBe(true);
    expect(isOlderRevision(revisionOne, { ...revisionOne, revision: 2 })).toBe(false);
  });

  it("does not compare revision numbers between unrelated artifacts", () => {
    expect(
      isOlderRevision(
        { ...revisionOne, revision: 7 },
        { ...revisionOne, artifactId: "other", revision: 1 },
      ),
    ).toBe(false);
    expect(isOlderRevision(null, revisionOne)).toBe(false);
  });
});
