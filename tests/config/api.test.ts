import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { registerConfigApi } from "../../src/config/api.js";
import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { createLogger } from "../../src/core/logger.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-config-api-test-"));
  tempDirs.push(dir);
  return dir;
}

async function startFastifyServer(app: FastifyInstance): Promise<{ baseUrl: string }> {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { baseUrl: address };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("registerConfigApi", () => {
  it("serves effective config, overlay CRUD, and schema routes", async () => {
    const dir = await createTempDir();
    const overlayStore = new ConfigOverlayStore(path.join(dir, "config", "overlay.yaml"), createLogger());
    await overlayStore.start();

    const app = Fastify({ logger: false });
    registerConfigApi(app, {
      getEffectiveConfig: () => ({
        tracker: { kind: "linear" },
        server: { port: 4000 },
      }),
      configOverlayStore: overlayStore,
    });

    const { baseUrl } = await startFastifyServer(app);
    try {
      const effectiveResponse = await fetch(`${baseUrl}/api/v1/config`);
      expect(effectiveResponse.status).toBe(200);
      expect(await effectiveResponse.json()).toEqual({
        tracker: { kind: "linear" },
        server: { port: 4000 },
      });

      const putPatchResponse = await fetch(`${baseUrl}/api/v1/config/overlay`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          codex: {
            model: "gpt-5.4",
          },
        }),
      });
      expect(putPatchResponse.status).toBe(200);
      expect((await putPatchResponse.json()).overlay).toEqual({
        codex: { model: "gpt-5.4" },
      });

      const patchPathResponse = await fetch(`${baseUrl}/api/v1/config/overlay/server.port`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          value: 4010,
        }),
      });
      expect(patchPathResponse.status).toBe(200);
      expect((await patchPathResponse.json()).overlay).toEqual({
        codex: { model: "gpt-5.4" },
        server: { port: 4010 },
      });

      const overlayResponse = await fetch(`${baseUrl}/api/v1/config/overlay`);
      expect(overlayResponse.status).toBe(200);
      expect(await overlayResponse.json()).toEqual({
        overlay: {
          codex: { model: "gpt-5.4" },
          server: { port: 4010 },
        },
      });

      const deleteResponse = await fetch(`${baseUrl}/api/v1/config/overlay/codex.model`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(204);

      const overlayAfterDeleteResponse = await fetch(`${baseUrl}/api/v1/config/overlay`);
      expect(await overlayAfterDeleteResponse.json()).toEqual({
        overlay: {
          server: { port: 4010 },
        },
      });

      const schemaResponse = await fetch(`${baseUrl}/api/v1/config/schema`);
      expect(schemaResponse.status).toBe(200);
      const schemaBody = await schemaResponse.json();
      expect(schemaBody.routes.put_overlay).toBe("PUT /api/v1/config/overlay");
    } finally {
      await overlayStore.stop();
      await app.close();
    }
  });

  it("returns validation errors for invalid payloads and method mismatches", async () => {
    const dir = await createTempDir();
    const overlayStore = new ConfigOverlayStore(path.join(dir, "config", "overlay.yaml"), createLogger());
    await overlayStore.start();

    const app = Fastify({ logger: false });
    registerConfigApi(app, {
      getEffectiveConfig: () => ({}),
      configOverlayStore: overlayStore,
    });

    const { baseUrl } = await startFastifyServer(app);
    try {
      const invalidPatchResponse = await fetch(`${baseUrl}/api/v1/config/overlay/test.path`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrong: 42 }),
      });
      expect(invalidPatchResponse.status).toBe(400);
      expect((await invalidPatchResponse.json()).error.code).toBe("invalid_overlay_payload");

      const unknownDeleteResponse = await fetch(`${baseUrl}/api/v1/config/overlay/unknownPath`, {
        method: "DELETE",
      });
      expect(unknownDeleteResponse.status).toBe(404);
      expect((await unknownDeleteResponse.json()).error.code).toBe("overlay_path_not_found");

      // Fastify returns 404 for unregistered method/route combos (not 405 like Express)
      const methodNotAllowedResponse = await fetch(`${baseUrl}/api/v1/config`, { method: "POST" });
      expect(methodNotAllowedResponse.status).toBe(404);
    } finally {
      await overlayStore.stop();
      await app.close();
    }
  });
});
