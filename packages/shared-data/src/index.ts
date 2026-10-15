/**
 * @repo/shared-data
 *
 * Shared data schemas, types, and API clients for the Rate platform
 * This package serves as the contract between frontend and backend
 */

// Export all schemas and types
export * from './schemas/index.js';

// Export API clients
export * from './clients/index.js';

// Export constants
export * from './constants/index.js';

// Version for API compatibility checking
export const SHARED_DATA_VERSION = '1.0.0';
