export type BuildEvent = {
  eventId: string;
  buildId: string;
  releaseId: string;
  artifactKey: string;
  status: "succeeded" | "failed";
};

export type ReleaseDecision =
  | { state: "blocked"; reason: "build_failed" | "artifact_missing" }
  | { state: "ready" };

export function decideRelease(
  event: BuildEvent,
  artifactFound: boolean,
): ReleaseDecision {
  if (event.status === "failed") {
    return { state: "blocked", reason: "build_failed" };
  }
  if (!artifactFound) {
    return { state: "blocked", reason: "artifact_missing" };
  }
  return { state: "ready" };
}
