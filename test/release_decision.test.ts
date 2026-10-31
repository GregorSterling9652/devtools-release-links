import assert from "node:assert/strict";
import test from "node:test";
import { decideRelease, type BuildEvent } from "../src/release_decision.js";

const successfulBuild: BuildEvent = {
  eventId: "evt_42",
  buildId: "build_42",
  releaseId: "caption-kit-1.8.0",
  artifactKey: "releases/caption-kit-1.8.0.tgz",
  status: "succeeded",
};

test("a successful build becomes ready only after its artifact is visible", () => {
  assert.deepEqual(decideRelease(successfulBuild, false), {
    state: "blocked",
    reason: "artifact_missing",
  });
  assert.deepEqual(decideRelease(successfulBuild, true), { state: "ready" });
});

test("a failed build stays blocked even when an older artifact shares its key", () => {
  assert.deepEqual(decideRelease({ ...successfulBuild, status: "failed" }, true), {
    state: "blocked",
    reason: "build_failed",
  });
});
