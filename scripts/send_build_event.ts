export {};

const serviceUrl = process.env.SERVICE_URL ?? "http://127.0.0.1:3000";

const response = await fetch(`${serviceUrl}/build-events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    eventId: "evt_release_2026_09_05",
    buildId: "build_1842",
    releaseId: "creator-cli-2.4.0",
    artifactKey: "releases/creator-cli-2.4.0.tgz",
    status: "succeeded",
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
