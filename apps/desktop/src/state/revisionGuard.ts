import type { ActiveArtifactInfo } from "../services/coreClient";

/**
 * A review is tied to the exact artifact content and revision on screen.
 * A server event must not silently replace that content while feedback is being drafted.
 */
export function isSameReviewSnapshot(
  current: ActiveArtifactInfo,
  incoming: ActiveArtifactInfo,
): boolean {
  return (
    current.sessionId === incoming.sessionId &&
    current.artifactId === incoming.artifactId &&
    current.revision === incoming.revision &&
    current.kind === incoming.kind &&
    current.entrypoint === incoming.entrypoint &&
    current.content === incoming.content
  );
}

/** Ignore delayed snapshots for an older revision of the same artifact. */
export function isOlderRevision(
  current: ActiveArtifactInfo | null,
  incoming: ActiveArtifactInfo,
): boolean {
  return (
    current !== null &&
    current.sessionId === incoming.sessionId &&
    current.artifactId === incoming.artifactId &&
    incoming.revision < current.revision
  );
}
