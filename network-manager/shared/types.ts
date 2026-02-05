/**
 * Shared type definitions for the Bethany Network Manager.
 *
 * Env bindings, and re-exports for downstream modules.
 * Data models (Contact, Circle, User, etc.) live in shared/models.ts (TASK-2cbc00d4-4).
 * Intent configuration lives in shared/intent-config.ts (TASK-f94df59b-a).
 */

// ---------------------------------------------------------------------------
// Cloudflare Worker Environment Bindings
// ---------------------------------------------------------------------------
export interface Env {
  // D1 Database
  DB: D1Database;

  // R2 Storage (bulk imports, exports, backups)
  STORAGE: R2Bucket;

  // Secrets
  ANTHROPIC_API_KEY: string;
  SENDBLUE_API_KEY: string;
  SENDBLUE_API_SECRET: string;
  SENDBLUE_PHONE_NUMBER: string;
  PIN_SIGNING_SECRET: string;
  INTERNAL_API_KEY: string;

  // Vars
  ENVIRONMENT: string;
  BETHANY_WORKER_URL: string;
  MAX_FREE_CONTACTS: string; // wrangler vars are always strings
  TRIAL_DAYS: string;
}

// ---------------------------------------------------------------------------
// API Response Helpers
// ---------------------------------------------------------------------------
export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

export interface ApiSuccess<T = unknown> {
  data: T;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
