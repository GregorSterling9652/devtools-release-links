import Fastify from "fastify";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_storage.js";
import { decideRelease, type BuildEvent } from "./release_decision.js";

const bucket = process.env.ARTIFACT_BUCKET ?? "developer-tool-releases";
const port = Number(process.env.PORT ?? 3000);
const identifier = z.string().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/);

const buildEventBody = z.object({
  eventId: identifier,
  buildId: identifier,
  releaseId: identifier,
  artifactKey: z.string().min(1).max(512),
  status: z.enum(["succeeded", "failed"]),
});

async function prepareArtifactBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (error instanceof InfraiError && error.status === 404) {
      await infrai.storage.bucket.create(bucket);
      return;
    }
    throw error;
  }
}

export function buildServer() {
  const server = Fastify({ logger: true });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return reply.status(status).send({
        error: "storage_request_rejected",
        detail: error.detail,
      });
    }
    server.log.error(error);
    return reply.status(500).send({ error: "internal_error" });
  });

  server.post("/build-events", async (request, reply) => {
    const parsed = buildEventBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_build_event",
        issues: parsed.error.issues,
      });
    }

    const event: BuildEvent = parsed.data;
    if (event.status === "failed") {
      return reply.status(202).send({
        buildId: event.buildId,
        releaseId: event.releaseId,
        ...decideRelease(event, false),
      });
    }

    const artifact = await infrai.storage.object.head(bucket, event.artifactKey);
    const decision = decideRelease(event, artifact.found);
    if (decision.state === "blocked") {
      return reply.status(202).send({
        buildId: event.buildId,
        releaseId: event.releaseId,
        ...decision,
      });
    }

    const signed = await infrai.storage.object.presign(bucket, event.artifactKey, {
      op: "get",
      expires_seconds: 900,
      response_disposition: `attachment; filename="${event.releaseId}.tgz"`,
      idempotency_key: event.eventId,
    });
    return reply.status(201).send({
      buildId: event.buildId,
      releaseId: event.releaseId,
      state: "ready",
      downloadUrl: signed.url,
      expiresInSeconds: 900,
    });
  });

  server.get("/diagnostics/artifacts", async () => {
    const listing = await infrai.storage.object.list(bucket);
    return {
      bucket,
      artifactCount: listing.items.length,
      artifacts: listing.items.map((item) => ({ key: item.key, size: item.size })),
    };
  });

  return server;
}

async function main(): Promise<void> {
  await prepareArtifactBucket();
  await buildServer().listen({ host: "127.0.0.1", port });
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
