/**
 * @repo/ai - AI Service Package
 * Provides scam detection, spam identification, and fake review analysis
 */

// Main service
export { AIAnalysisService } from './ai-service';

// Providers
export { OpenAIProvider } from './providers/openai.provider';

// Rules Engine
export { RulesEngine } from './rules-engine';

// Types
export * from './types';

// Default export for convenience
import { AIAnalysisService } from './ai-service';
export default AIAnalysisService;