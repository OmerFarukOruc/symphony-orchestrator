describe("configResponseSchema", () => {
  it("parses a freeform config object", () => {
    const result = configResponseSchema.parse({ codex: { model: "gpt-5.4" }, server: { port: 4000 } });
    expect(result.codex).toEqual({ model: "gpt-5.4" });
  });

  it("parses empty config", () => {
    const result = configResponseSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects non-object values", () => {
    expect(configResponseSchema.safeParse("string").success).toBe(false);
    expect(configResponseSchema.safeParse(123).success).toBe(false);
  });
});

describe("configSchemaResponseSchema", () => {
  it("parses a freeform schema object", () => {
    const result = configSchemaResponseSchema.parse({
      overlay_put_body_examples: [],
      routes: { get_config: "GET /api/v1/config" },
    });
    expect(result.routes).toEqual({ get_config: "GET /api/v1/config" });
  });

  it("rejects non-object values", () => {
    expect(configSchemaResponseSchema.safeParse(42).success).toBe(false);
  });
});

describe("configOverlayGetResponseSchema", () => {
  it("parses a valid overlay get response", () => {
    const result = configOverlayGetResponseSchema.parse({
      overlay: { codex: { model: "gpt-5.4" } },
    });
    expect(result.overlay.codex).toEqual({ model: "gpt-5.4" });
  });

  it("accepts empty overlay", () => {
    const result = configOverlayGetResponseSchema.parse({ overlay: {} });
    expect(result.overlay).toEqual({});
  });

  it("rejects missing overlay key", () => {
    expect(configOverlayGetResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("configOverlayPutResponseSchema", () => {
  it("parses a valid overlay put response", () => {
    const result = configOverlayPutResponseSchema.parse({
      updated: true,
      overlay: { codex: { model: "gpt-5.4" } },
    });
    expect(result.updated).toBe(true);
  });

  it("rejects missing updated field", () => {
    expect(configOverlayPutResponseSchema.safeParse({ overlay: {} }).success).toBe(false);
  });

  it("rejects missing overlay field", () => {
    expect(configOverlayPutResponseSchema.safeParse({ updated: true }).success).toBe(false);
  });
});

describe("configOverlayPatchResponseSchema", () => {
  it("parses a valid overlay patch response", () => {
    const result = configOverlayPatchResponseSchema.parse({
      updated: true,
      overlay: { server: { port: 4001 } },
    });
    expect(result.updated).toBe(true);
  });

  it("rejects non-boolean updated", () => {
    expect(configOverlayPatchResponseSchema.safeParse({ updated: "yes", overlay: {} }).success).toBe(false);
  });
});

describe("configOverlayPutRequestSchema", () => {
  it("parses a request with patch field", () => {
    const result = configOverlayPutRequestSchema.parse({
      patch: { codex: { model: "gpt-5.4" } },
    });
    expect(result.patch).toEqual({ codex: { model: "gpt-5.4" } });
  });

  it("parses a request without patch field (direct overlay)", () => {
    const result = configOverlayPutRequestSchema.parse({
      codex: { model: "gpt-5.4" },
    });
    expect(result.codex).toEqual({ model: "gpt-5.4" });
  });

  it("accepts empty object", () => {
    const result = configOverlayPutRequestSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects non-object values", () => {
    expect(configOverlayPutRequestSchema.safeParse("string").success).toBe(false);
  });
});
