#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import readline from "node:readline";

const scenario = process.env.MOCK_CODEX_SCENARIO ?? "success";
const logPath = process.env.MOCK_CODEX_LOG_PATH ?? "";
const events = [];
const pending = new Map();
let nextServerRequestId = 900;

function record(event) {
  events.push({ at: new Date().toISOString(), ...event });
}

function flushLog() {
  if (!logPath) {
    return;
  }
  writeFileSync(logPath, JSON.stringify(events, null, 2), "utf8");
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResponse(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendRequest(method, params) {
  const id = nextServerRequestId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
  });
}

function startSuccessTurnSequence(turnRequestId, agentText = "Here is the result.") {
  sendRequest("item/commandExecution/requestApproval", { command: "echo hi" })
    .then(() => sendRequest("item/fileChange/requestApproval", { path: "file.txt" }))
    .then(() =>
      sendRequest("item/permissions/requestApproval", {
        permissionProfile: { mode: "full" },
      }),
    )
    .then(() =>
      sendRequest("item/tool/call", {
        name: "linear_graphql",
        arguments: { query: "query One { viewer { id } }" },
      }),
    )
    .then(() =>
      sendRequest("item/tool/call", {
        name: "unknown_tool",
        arguments: { value: 1 },
      }),
    )
    .then(() => {
      sendResponse(turnRequestId, {
        turn: {
          id: "turn-1",
          status: "inProgress",
          items: [],
          error: null,
        },
      });
      send({
        jsonrpc: "2.0",
        method: "turn/started",
        params: {
          turn: {
            id: "turn-1",
          },
        },
      });

      // Emulate reasoning stream
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { type: "reasoning", id: "reason-1" } } });
      send({ jsonrpc: "2.0", method: "item/reasoning/summaryTextDelta", params: { delta: { id: "reason-1", text: "I need to " } } });
      send({ jsonrpc: "2.0", method: "item/reasoning/summaryPartAdded", params: { itemId: "reason-1", part: { text: "run a query." } } });
      send({ jsonrpc: "2.0", method: "item/completed", params: { item: { type: "reasoning", id: "reason-1" } } });

      // Emulate agent message
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { type: "agentMessage", id: "msg-1" } } });
      send({ jsonrpc: "2.0", method: "item/completed", params: { item: { type: "agentMessage", id: "msg-1", text: agentText } } });

      send({
        jsonrpc: "2.0",
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          tokenUsage: {
            last: {
              cachedInputTokens: 0,
              inputTokens: 11,
              outputTokens: 7,
              reasoningOutputTokens: 0,
              totalTokens: 18,
            },
            total: {
              cachedInputTokens: 0,
              inputTokens: 11,
              outputTokens: 7,
              reasoningOutputTokens: 0,
              totalTokens: 18,
            },
            modelContextWindow: 1000000,
          },
        },
      });
      send({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "completed",
            items: [],
            error: null,
            tokenUsage: {
              inputTokens: 12,
              outputTokens: 8,
              totalTokens: 20,
            },
          },
        },
      });
    })
    .catch((error) => {
      record({ type: "sequence_error", error: String(error) });
    });
}

async function onClientRequest(message) {
  record({ type: "client_request", method: message.method, params: message.params ?? null });

  switch (message.method) {
    case "initialize":
      sendResponse(message.id, { capabilities: { ok: true } });
      return;
    case "account/read":
      if (scenario === "auth_required") {
        sendResponse(message.id, { authRequired: true, account: null });
        return;
      }
      sendResponse(message.id, { status: "authenticated", account: { id: "acct-1" } });
      return;
    case "account/rateLimits/read":
      sendResponse(message.id, { rateLimits: { remaining: 42, resetAt: "soon" } });
      return;
    case "thread/start":
      if (scenario === "mcp_required_failure") {
        sendRequest("mcpServer/elicitation/request", { prompt: "start required mcp" }).catch(() => undefined);
        return;
      }
      if (scenario === "port_exit") {
        process.exit(7);
      }
      sendResponse(message.id, { threadId: "thread-1" });
      return;
    case "turn/start":
      if (scenario === "user_input") {
        sendRequest("item/tool/requestUserInput", { prompt: "Need input" }).catch(() => undefined);
        startSuccessTurnSequence(message.id);
        return;
      }
      if (scenario === "done_signal") {
        startSuccessTurnSequence(message.id, "Smoke test complete.\n\nSYMPHONY_STATUS: DONE");
        return;
      }
      if (scenario === "hang_turn") {
        return;
      }
      startSuccessTurnSequence(message.id);
      return;
    default:
      sendResponse(message.id, {});
  }
}

async function onIncoming(line) {
  const message = JSON.parse(line);

  if (message.method && "id" in message) {
    await onClientRequest(message);
    return;
  }

  if (message.method) {
    record({ type: "client_notification", method: message.method, params: message.params ?? null });
    return;
  }

  if ("id" in message && ("result" in message || "error" in message)) {
    const pendingRequest = pending.get(message.id);
    if (pendingRequest) {
      pending.delete(message.id);
      record({
        type: "server_request_result",
        method: pendingRequest.method,
        result: message.result ?? null,
        error: message.error ?? null,
      });
      pendingRequest.resolve(message.result ?? message.error ?? null);
    }
  }
}

process.on("exit", () => {
  flushLog();
});
process.on("SIGTERM", () => {
  flushLog();
  process.exit(0);
});

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) {
    continue;
  }
  await onIncoming(line);
}
