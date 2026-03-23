export interface MagiaErrorOptions {
  status: number;
  code: string;
  api: string;
  operation: string;
  data: unknown;
  response?: Response;
}

export class MagiaError extends Error {
  readonly status: number;
  readonly code: string;
  readonly api: string;
  readonly operation: string;
  readonly data: unknown;
  readonly response?: Response;

  constructor(message: string, opts: MagiaErrorOptions) {
    super(message);
    this.name = "MagiaError";
    this.status = opts.status;
    this.code = opts.code;
    this.api = opts.api;
    this.operation = opts.operation;
    this.data = opts.data;
    this.response = opts.response;
  }

  isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR";
  }

  isAborted(): boolean {
    return this.code === "ABORTED";
  }

  isTimeout(): boolean {
    return this.code === "TIMEOUT";
  }

  isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }
}
