import { Type, type Static, type TSchema } from "@sinclair/typebox";

export const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
export const NullableNumberSchema = Type.Union([Type.Number(), Type.Null()]);
export const StringArraySchema = Type.Array(Type.String());
export const UnknownRecordSchema = Type.Record(Type.String(), Type.Unknown());

export const ErrorDetailSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
});

export const ErrorEnvelopeSchema = Type.Object({
  error: ErrorDetailSchema,
});

export const StringErrorSchema = Type.Object({
  error: Type.String(),
});

export const OpenApiInfoSchema = Type.Object({
  title: Type.String(),
  version: Type.String(),
});

export const OpenApiDocumentSchema = Type.Object({
  openapi: Type.String(),
  info: OpenApiInfoSchema,
  paths: Type.Record(Type.String(), Type.Unknown()),
});

export function jsonContent(schema: TSchema): Record<string, { schema: TSchema }> {
  return {
    "application/json": { schema },
  };
}

export type ErrorResponse = Static<typeof ErrorEnvelopeSchema>;
export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;
export type StringErrorResponse = Static<typeof StringErrorSchema>;
export type OpenApiInfo = Static<typeof OpenApiInfoSchema>;
export type OpenApiDocument = Static<typeof OpenApiDocumentSchema>;
