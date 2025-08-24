/**
 * AI Service Type Definitions
 * Can be moved to any package after restructuring
 */

export interface AIProvider {
  name: string;
  analyze(text: string): Promise<AnalysisResult>;
  detectSpam(data: SpamCheckData): Promise<SpamResult>;
  checkFakeReview(review: string): Promise<FakeReviewResult>;
  analyzeSentiment(text: string): Promise<SentimentResult>;
}

export interface AnalysisResult {
  isScam: boolean;
  confidence: number; // 0-1
  category: ScamCategory;
  severity: Severity;
  indicators: string[];
  sentiment: Sentiment;
  explanation: string;
  metadata: {
    processingTime: number;
    modelVersion: string;
    provider: string;
    error?: string; // Optional error message
  };
}

export type ScamCategory = 
  | 'financial' 
  | 'phishing' 
  | 'fake_goods' 
  | 'identity_theft' 
  | 'romance_scam'
  | 'tech_support'
  | 'investment'
  | 'other';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface SpamCheckData {
  phone: string;
  callFrequency?: number;
  reportCount?: number;
  timePattern?: string;
  firstSeen?: Date;
  lastSeen?: Date;
}

export interface SpamResult {
  isSpam: boolean;
  confidence: number;
  spamType?: 'telemarketing' | 'robocall' | 'scam' | 'survey' | 'debt_collector';
  reason: string;
}

export interface FakeReviewResult {
  isFake: boolean;
  confidence: number;
  indicators: string[];
  reviewQuality: 'authentic' | 'suspicious' | 'likely_fake' | 'confirmed_fake';
}

export interface SentimentResult {
  sentiment: Sentiment;
  confidence: number;
  emotions?: {
    anger?: number;
    fear?: number;
    joy?: number;
    sadness?: number;
    surprise?: number;
  };
}

export interface RuleCheckResult {
  confidence: number;
  indicators: string[];
  category?: ScamCategory;
  isScam: boolean;
  matchedRules: string[];
}

export interface AIServiceConfig {
  provider: 'openai' | 'selfhosted';
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  rateLimitPerMinute?: number;
}

export interface CacheConfig {
  host: string;
  port: number;
  ttl: number;
  keyPrefix: string;
}

// Vietnamese-specific types
export interface VietnameseContext {
  hasVietnameseText: boolean;
  hasPhoneNumber: boolean;
  hasBankAccount: boolean;
  hasAddress: boolean;
  dialect?: 'northern' | 'central' | 'southern';
  slangWords?: string[];
}

// Batch processing types
export interface BatchAnalysisRequest {
  items: Array<{
    id: string;
    type: 'phone' | 'website' | 'review' | 'transaction';
    content: any;
    source: string;
  }>;
  priority?: 'low' | 'normal' | 'high';
  callback?: string; // Webhook URL for results
}

export interface BatchAnalysisResult {
  batchId: string;
  processedCount: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    id: string;
    analysis?: AnalysisResult;
    error?: string;
  }>;
  startTime: Date;
  endTime: Date;
  totalProcessingTime: number;
}

// Monitoring types
export interface AIMetrics {
  // Performance
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerMinute: number;
  
  // Accuracy (requires manual labeling)
  truePositives?: number;
  falsePositives?: number;
  trueNegatives?: number;
  falseNegatives?: number;
  
  // Cost
  apiCallsCount: number;
  tokensUsed?: number;
  estimatedCost: number;
  cacheHitRate: number;
  
  // Business metrics
  scamsDetected: number;
  spamDetected: number;
  fakeReviewsDetected: number;
  categoriesBreakdown: Record<ScamCategory, number>;
}

// Error types
export class AIServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class RateLimitError extends AIServiceError {
  constructor(message: string, provider?: string) {
    super(message, 'RATE_LIMIT', provider, true);
    this.name = 'RateLimitError';
  }
}

export class InvalidInputError extends AIServiceError {
  constructor(message: string) {
    super(message, 'INVALID_INPUT', undefined, false);
    this.name = 'InvalidInputError';
  }
}