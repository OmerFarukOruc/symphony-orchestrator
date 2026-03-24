// Backend source stays in the repository root during Task 1.
// This barrel exposes the current coordinator modules for future workspace imports.
export { createServices } from "../../../src/cli/services.js";
export { HttpServer } from "../../../src/http/server.js";
export { Orchestrator } from "../../../src/orchestrator/orchestrator.js";
