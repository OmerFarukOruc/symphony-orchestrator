import { createDataPlaneServer } from "./server.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger().child({ component: "data-plane-entrypoint" });

const PORT = parseInt(process.env.DISPATCH_PORT ?? "9100", 10);
const SECRET = process.env.DISPATCH_SHARED_SECRET ?? "";

if (!SECRET) {
  logger.error({}, "DISPATCH_SHARED_SECRET is required");
  process.exit(1);
}

const app = createDataPlaneServer(SECRET);

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "Data plane server listening");
});

// Graceful shutdown
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({}, "Shutting down data plane server...");
  server.close(() => {
    logger.info({}, "Data plane server closed");
    process.exit(0);
  });
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
