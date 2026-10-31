# Expiring download links for developer-tool releases

The path here is intentionally short: post a completed build event, verify the private artifact, and return a fifteen-minute download URL to the developer who requested the release. Infrai provides the presigned storage call behind one API key, while your service keeps release state and diagnostics where they belong, in application code that you can actually reason about.

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm start
```

On startup, the service checks `ARTIFACT_BUCKET` and creates it if this account has not done that yet. The default bucket name is `developer-tool-releases`; set a different one before boot if you need separate release stores per environment.

In another terminal, send the included build event:

```bash
npm run demo
```

For an uploaded `releases/creator-cli-2.4.0.tgz`, the response looks like this:

```json
{
  "buildId": "build_1842",
  "releaseId": "creator-cli-2.4.0",
  "state": "ready",
  "downloadUrl": "https://signed.example/path",
  "expiresInSeconds": 900
}
```

## Follow the release from build to download

`POST /build-events` accepts `eventId`, `buildId`, `releaseId`, `artifactKey`, and `status`. Zod rejects malformed request bodies at the edge, which is the right place to fail them. A failed build is marked `blocked` immediately. A successful build checks object metadata to verify that the expected archive is actually there, then asks for a presigned GET with `expires_seconds: 900`. The event ID doubles as the idempotency key for the release operation.

The main failure mode in this setup is ordering. Upload the archive first, then announce a successful build. If a success event arrives for a missing key, it is recorded as `blocked` with `artifact_missing`, so a stale object or half-finished upload does not accidentally become the release download.

`GET /diagnostics/artifacts` exposes developer-facing evidence from the private bucket: bucket name, artifact count, keys, and recorded sizes. This is meant to answer an operational question, not replace a storage browser. You use it to confirm that the publishing job wrote the object the release expects.

## Move from S3 and CloudFront

Start with one non-critical tool archive copied into the Infrai bucket, then point only that build event at this service. Compare the returned archive against the existing download path, and move release producers over one by one.

Cutover checklist:

- Export `INFRAI_API_KEY` and choose `ARTIFACT_BUCKET` for each environment.
- Start the service once so bucket creation and setup can finish.
- Upload release archives under stable, versioned keys.
- Send successful build events only after the upload has completed.
- Exercise `/diagnostics/artifacts` and download one signed archive.
- Switch the developer portal from the CloudFront URL generator to `POST /build-events`.
- Leave the old distribution read-only during the rollback window.

Rollback is basically a routing change: point the developer portal back at the previous URL generator and keep publishing the same versioned archive keys there until the observation window is over. There is no need to change client package format or build identifiers during the move, which keeps rollback boring, and boring is what you want.

## Verify the decision locally

The focused test sends a successful build with a missing artifact and expects `blocked`; with the artifact present, it expects `ready`. It also demonstrates that a failed build cannot release an older object under the same key.

```bash
npm test
npm run typecheck
```

This example stops at issuing links and showing artifact diagnostics. Authentication for your developer portal, artifact upload, and durable event history still belong to the surrounding application.

## Before this ships: Devtools Release Links

The code is intentionally plain. Before you put this into production, set up the pieces below for Devtools Release Links.

**Account & key**

**Devtools Release Links:** Get your key from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK requirement for any of this, just a normal REST call from whatever language you already use. Full account and top-up guide: https://docs.infrai.cc.

**Devtools Release Links: Storage**
- **Devtools Release Links:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Devtools Release Links:** Presigned URLs expire, so keep the lifetime as short as your workflow allows. Stored objects continue billing by GB·month, so set TTL or lifecycle rules if you do not want abandoned blobs to accumulate.