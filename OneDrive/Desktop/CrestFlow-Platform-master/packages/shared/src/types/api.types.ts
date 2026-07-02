/** Standard API response envelope (instructions.md §11). */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface ApiMeta {
  timestamp: string;
  requestId: string;
  version: string;
}

/** Paginated response with cursor-based pagination. */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: ApiMeta & {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

/** Standard API response type — either success or error. */
export type ApiResult<T> = ApiResponse<T> | ApiError;
