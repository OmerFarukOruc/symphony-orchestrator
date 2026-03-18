export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
}

let nextId = 1;

export function createRequest(method: string, params: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: nextId++,
    method,
    params,
  };
}

export function createSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function createErrorResponse(id: JsonRpcId, message: string): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message,
    },
  };
}

export function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { method?: unknown }).method === "string" &&
    "id" in message
  );
}

export function isJsonRpcNotification(message: unknown): message is JsonRpcNotification {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { method?: unknown }).method === "string" &&
    !("id" in message)
  );
}

export function isJsonRpcSuccessResponse(message: unknown): message is JsonRpcSuccessResponse {
  return typeof message === "object" && message !== null && "id" in message && "result" in message;
}

export function isJsonRpcErrorResponse(message: unknown): message is JsonRpcErrorResponse {
  return typeof message === "object" && message !== null && "id" in message && "error" in message;
}
