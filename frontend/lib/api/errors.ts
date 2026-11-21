import type { ApiError } from "@square/shared";
export class ClientApiError extends Error {
  code: string;
  field?: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.field = err.field;
  }
}
