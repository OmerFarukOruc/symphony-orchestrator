export interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

interface WithLoadingOptions {
  onChange?: () => void;
}

export function createAsyncState<T>(data: T | null = null): AsyncState<T> {
  return {
    loading: data === null,
    error: null,
    data,
  };
}

export async function withLoading<T, TResult>(
  state: AsyncState<T>,
  fn: () => Promise<TResult>,
  options: WithLoadingOptions = {},
): Promise<TResult> {
  state.loading = true;
  options.onChange?.();
  try {
    return await fn();
  } finally {
    state.loading = false;
    options.onChange?.();
  }
}

export function handleError<T>(state: AsyncState<T>, error: unknown, defaultMessage: string): string {
  const message = normalizeError(error, defaultMessage);
  state.error = message;
  return message;
}

function normalizeError(error: unknown, defaultMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return defaultMessage;
}
