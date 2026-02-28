// src/clients/response.ts
// Supabase-style { data, error } response type with throwOnError()

/**
 * Error returned by client SDK operations.
 */
export interface RememberError {
  code: string;
  message: string;
  status: number;
  context?: Record<string, unknown>;
}

/**
 * Supabase-style response: { data, error } with chainable .throwOnError().
 */
export interface SdkResponse<T> {
  data: T | null;
  error: RememberError | null;
  /** Throws RememberError if error exists, otherwise returns data (non-null). */
  throwOnError(): T;
}

/**
 * Create a successful SdkResponse.
 */
export function createSuccess<T>(data: T): SdkResponse<T> {
  return {
    data,
    error: null,
    throwOnError() {
      return data;
    },
  };
}

/**
 * Create a failed SdkResponse.
 */
export function createError<T = never>(error: RememberError): SdkResponse<T> {
  return {
    data: null,
    error,
    throwOnError() {
      throw error;
    },
  };
}

/**
 * Map an HTTP Response to an SdkResponse.
 * 2xx responses parse JSON body as data.
 * Non-2xx responses map to RememberError.
 */
export async function fromHttpResponse<T>(response: Response): Promise<SdkResponse<T>> {
  if (response.ok) {
    const data = await response.json() as T;
    return createSuccess(data);
  }

  let body: Record<string, unknown> | undefined;
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    // non-JSON error body
  }

  const error: RememberError = {
    code: mapStatusToCode(response.status),
    message: (body?.message as string) ?? (body?.error as string) ?? response.statusText,
    status: response.status,
    ...(body?.context ? { context: body.context as Record<string, unknown> } : {}),
  };

  return createError(error);
}

function mapStatusToCode(status: number): string {
  switch (status) {
    case 400: return 'bad_request';
    case 401: return 'unauthorized';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 409: return 'conflict';
    case 422: return 'validation';
    case 429: return 'rate_limited';
    case 500: return 'internal';
    case 502: return 'bad_gateway';
    case 503: return 'service_unavailable';
    default: return `http_${status}`;
  }
}
