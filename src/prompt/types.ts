/**
 * Shared type definitions for the prompt template subsystem.
 *
 * Both the port interface (port.ts) and the concrete store implementation
 * (store.ts) depend on these types, so they live here to avoid a circular
 * dependency between those two modules.
 */

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewResult {
  rendered: string;
  error: string | null;
}
