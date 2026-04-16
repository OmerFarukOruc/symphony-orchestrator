export interface GitHubTransportDeps {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  apiBaseUrl?: string;
  defaultTokenEnv?: string;
  authorizationHeaderName?: string;
  defaultHeaders?: Record<string, string>;
  allowMissingToken?: boolean;
}

export interface GitHubTransportRequest {
  pathName: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  token?: string;
  tokenEnvName?: string;
  allowMissingToken?: boolean;
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`github request failed with status ${status}: ${JSON.stringify(payload)}`, { cause: payload });
    this.name = "GitHubApiError";
  }
}

export function buildGraphqlEndpoint(apiBaseUrl: string): string {
  const parsed = new URL(apiBaseUrl);
  parsed.search = "";
  parsed.hash = "";
  const normalizedPath = parsed.pathname.replace(/\/+$/u, "");

  if (parsed.hostname === "api.github.com") {
    parsed.pathname = "/graphql";
    return parsed.toString();
  }

  if (normalizedPath === "/api/v3") {
    parsed.pathname = "/api/graphql";
    return parsed.toString();
  }

  parsed.pathname = `${normalizedPath}/graphql`;
  return parsed.toString();
}

export async function readGitHubPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class GitHubTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;
  private readonly apiBaseUrl: string;
  private readonly graphqlEndpoint: string;
  private readonly defaultTokenEnv: string;
  private readonly authorizationHeaderName: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly allowMissingToken: boolean;

  constructor(deps: GitHubTransportDeps = {}) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.env = deps.env ?? process.env;
    this.apiBaseUrl = deps.apiBaseUrl ?? "https://api.github.com";
    this.graphqlEndpoint = buildGraphqlEndpoint(this.apiBaseUrl);
    this.defaultTokenEnv = deps.defaultTokenEnv ?? "GITHUB_TOKEN";
    this.authorizationHeaderName = deps.authorizationHeaderName ?? "authorization";
    this.defaultHeaders = deps.defaultHeaders ?? {};
    this.allowMissingToken = deps.allowMissingToken ?? false;
  }

  async send(request: GitHubTransportRequest): Promise<Response> {
    return this.fetchImpl(`${this.apiBaseUrl}${request.pathName}`, {
      method: request.method,
      headers: this.buildHeaders(request),
      body: request.body,
    });
  }

  async request(request: GitHubTransportRequest): Promise<unknown> {
    const response = await this.send(request);
    const payload = await readGitHubPayload(response);
    if (!response.ok) {
      throw new GitHubApiError(response.status, payload);
    }
    return payload;
  }

  async graphql(input: {
    query: string;
    variables: Record<string, unknown>;
    token?: string;
    tokenEnvName?: string;
    headers?: Record<string, string>;
  }): Promise<{ response: Response; payload: unknown }> {
    const response = await this.fetchImpl(this.graphqlEndpoint, {
      method: "POST",
      headers: this.buildHeaders({
        token: input.token,
        tokenEnvName: input.tokenEnvName,
        headers: input.headers,
      }),
      body: JSON.stringify({
        query: input.query,
        variables: input.variables,
      }),
    });
    const payload = await readGitHubPayload(response);
    return { response, payload };
  }

  private buildHeaders(
    request: Pick<GitHubTransportRequest, "token" | "tokenEnvName" | "headers" | "allowMissingToken">,
  ): Record<string, string> {
    return {
      ...this.defaultHeaders,
      [this.authorizationHeaderName]: `Bearer ${this.resolveToken(
        request.token,
        request.tokenEnvName,
        request.allowMissingToken,
      )}`,
      ...request.headers,
    };
  }

  private resolveToken(
    tokenOverride?: string,
    tokenEnvName?: string,
    allowMissingToken = this.allowMissingToken,
  ): string {
    if (tokenOverride !== undefined) {
      return tokenOverride;
    }

    const resolvedTokenEnv = tokenEnvName ?? this.defaultTokenEnv;
    const token = this.env[resolvedTokenEnv];
    if (token === undefined) {
      if (allowMissingToken) {
        return "";
      }
      throw new Error(`missing GitHub token env var: ${resolvedTokenEnv}`);
    }
    return token;
  }
}
