/**
 * @repo/shared-data
 *
 * Shared data schemas, types, and API clients for the Rate platform
 * This package serves as the contract between frontend and backend
 */

// Export Zod 4 runtime and all schemas/types
export { z } from 'zod';
export * from './schemas/index.js';

// Export API clients
export * from './clients/index.js';

// Export constants
export * from './constants/index.js';

// `rate` schema types generated from supabase/migrations (pnpm gen:db-types)
export type { Database, Json } from './database.types.js';

// Version for API compatibility checking
export const SHARED_DATA_VERSION = '2.0.0';
