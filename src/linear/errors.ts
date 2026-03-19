type LinearErrorCode =
  | "linear_transport_error"
  | "linear_http_error"
  | "linear_graphql_error"
  | "linear_unknown_payload"
  | "linear_missing_end_cursor";

export class LinearClientError extends Error {
  constructor(
    readonly code: LinearErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LinearClientError";
  }
}
