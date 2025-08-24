/**
 * @repo/shared-data
 * 
 * Shared data schemas, types, and API clients for the Rate platform
 * This package serves as the contract between frontend and backend
 */

// Export all schemas and types
export * from './schemas';

// Export API clients
export * from './clients';

// Export constants
export * from './constants';

// Version for API compatibility checking
export const SHARED_DATA_VERSION = '1.0.0';