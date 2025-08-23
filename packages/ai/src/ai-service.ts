/**
 * Main AI Analysis Service
 * Orchestrates rules engine, AI providers, and caching
 */

// Load environment variables from root .env
import * as dotenv from 'dotenv';
import * as path from 'path';

// Try to load from project root .env first
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// Also try from package root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Redis from 'ioredis';
import { createHash } from 'crypto';
import { OpenAIProvider } from './providers/openai.provider';
import { RulesEngine } from './rules-engine';
import {
  AIProvider,
  AnalysisResult,
  AIServiceConfig,
  SpamCheckData,
  SpamResult,
  FakeReviewResult,
  SentimentResult,
  BatchAnalysisRequest,
  BatchAnalysisResult,
  AIMetrics,
  AIServiceError,
  InvalidInputError,
  ScamCategory
} from './types';

export class AIAnalysisService {
  private provider: AIProvider;
  private rulesEngine: RulesEngine;
  private redis: Redis | null = null;
  private config: AIServiceConfig;
  private metrics: AIMetrics = {
    avgResponseTime: 0,
    p95ResponseTime: 0,
    p99ResponseTime: 0,
    requestsPerMinute: 0,
    apiCallsCount: 0,
    estimatedCost: 0,
    cacheHitRate: 0,
    scamsDetected: 0,
    spamDetected: 0,
    fakeReviewsDetected: 0,
    categoriesBreakdown: {} as Record<ScamCategory, number>
  };
  private responseTimes: number[] = [];

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      provider: config?.provider || process.env.AI_PROVIDER as any || 'openai',
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      model: config?.model || process.env.OPENAI_MODEL || 'gpt-5',
      temperature: config?.temperature || parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
      maxTokens: config?.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
      cacheEnabled: config?.cacheEnabled ?? process.env.AI_CACHE_ENABLED === 'true',
      cacheTTL: config?.cacheTTL || parseInt(process.env.AI_CACHE_TTL || '3600'),
      rateLimitPerMinute: config?.rateLimitPerMinute || parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || '100')
    };

    // Initialize provider
    this.provider = this.initializeProvider();
    
    // Initialize rules engine
    this.rulesEngine = new RulesEngine();
    
    // Initialize Redis if caching is enabled
    if (this.config.cacheEnabled) {
      this.initializeRedis();
    }
  }

  private initializeProvider(): AIProvider {
    switch (this.config.provider) {
      case 'openai':
        if (!this.config.apiKey) {
          throw new AIServiceError('OpenAI API key is required', 'MISSING_API_KEY');
        }
        return new OpenAIProvider({
          apiKey: this.config.apiKey,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        });
      
      case 'selfhosted':
        // Future implementation
        throw new AIServiceError('Self-hosted provider not yet implemented', 'NOT_IMPLEMENTED');
      
      default:
        throw new AIServiceError(`Unknown provider: ${this.config.provider}`, 'INVALID_PROVIDER');
    }
  }

  private initializeRedis(): void {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      });

      this.redis.on('error', (err) => {
        console.error('Redis connection error:', err);
        // Don't throw - caching is optional
        this.redis = null;
      });

      this.redis.on('connect', () => {
        console.log('Redis connected for AI caching');
      });
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.redis = null;
    }
  }

  /**
   * Main analysis method
   */
  async analyzeContent(data: {
    type: 'phone' | 'website' | 'review' | 'transaction';
    content: any;
    source?: string;
    metadata?: any;
  }): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    // Validate input
    this.validateInput(data);
    
    // Check cache first
    const cacheKey = this.getCacheKey(data);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.updateMetrics(Date.now() - startTime, true);
      return cached;
    }
    
    // Run rules engine for quick checks
    const rulesResult = await this.rulesEngine.check(data);
    
    // If rules engine has high confidence, use its result
    if (rulesResult.confidence > 0.95) {
      const result = this.formatRulesResult(rulesResult);
      await this.saveToCache(cacheKey, result);
      this.updateMetrics(Date.now() - startTime, false);
      return result;
    }
    
    // If rules engine is uncertain, use AI
    let aiResult: AnalysisResult;
    
    try {
      // Prepare content for AI analysis
      const textContent = this.extractTextContent(data);
      aiResult = await this.provider.analyze(textContent);
      
      // Combine rules and AI results
      const finalResult = this.combineResults(rulesResult, aiResult);
      
      // Add processing metadata
      finalResult.metadata.processingTime = Date.now() - startTime;
      
      // Cache the result
      await this.saveToCache(cacheKey, finalResult);
      
      // Update metrics
      this.updateMetrics(Date.now() - startTime, false);
      this.updateBusinessMetrics(finalResult);
      
      // Store high-confidence scams for reporting
      if (finalResult.isScam && finalResult.confidence > 0.8) {
        await this.storeScamAlert(finalResult, data);
      }
      
      return finalResult;
    } catch (error) {
      console.error('AI analysis error:', error);
      
      // Fallback to rules engine result if AI fails
      const fallbackResult = this.formatRulesResult(rulesResult);
      fallbackResult.metadata.error = 'AI analysis failed, using rules engine';
      
      this.updateMetrics(Date.now() - startTime, false);
      return fallbackResult;
    }
  }

  /**
   * Batch analysis for multiple items
   */
  async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResult> {
    const startTime = Date.now();
    const results: BatchAnalysisResult['results'] = [];
    
    // Process in parallel with concurrency limit
    const concurrency = 5;
    const chunks = this.chunkArray(request.items, concurrency);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          try {
            const analysis = await this.analyzeContent(item);
            return { id: item.id, analysis };
          } catch (error: any) {
            return { id: item.id, error: error.message };
          }
        })
      );
      results.push(...chunkResults);
    }
    
    const successCount = results.filter(r => r.analysis).length;
    const failureCount = results.filter(r => r.error).length;
    
    return {
      batchId: this.generateBatchId(),
      processedCount: results.length,
      successCount,
      failureCount,
      results,
      startTime: new Date(startTime),
      endTime: new Date(),
      totalProcessingTime: Date.now() - startTime
    };
  }

  /**
   * Spam detection
   */
  async detectSpam(data: SpamCheckData): Promise<SpamResult> {
    const cacheKey = `spam:${data.phone}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const result = await this.provider.detectSpam(data);
    await this.saveToCache(cacheKey, result);
    
    if (result.isSpam) {
      this.metrics.spamDetected++;
    }
    
    return result;
  }

  /**
   * Fake review detection
   */
  async checkFakeReview(review: string): Promise<FakeReviewResult> {
    const cacheKey = `review:${this.hashContent(review)}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const result = await this.provider.checkFakeReview(review);
    await this.saveToCache(cacheKey, result);
    
    if (result.isFake) {
      this.metrics.fakeReviewsDetected++;
    }
    
    return result;
  }

  /**
   * Sentiment analysis
   */
  async analyzeSentiment(text: string): Promise<SentimentResult> {
    const cacheKey = `sentiment:${this.hashContent(text)}`;
    const cached = await this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const result = await this.provider.analyzeSentiment(text);
    await this.saveToCache(cacheKey, result);
    
    return result;
  }

  /**
   * Get current metrics
   */
  getMetrics(): AIMetrics {
    return {
      ...this.metrics,
      avgResponseTime: this.calculateAvgResponseTime(),
      p95ResponseTime: this.calculatePercentile(95),
      p99ResponseTime: this.calculatePercentile(99)
    };
  }

  // Helper methods
  
  private validateInput(data: any): void {
    if (!data.type || !data.content) {
      throw new InvalidInputError('Missing required fields: type and content');
    }
    
    const maxLength = parseInt(process.env.AI_MAX_INPUT_LENGTH || '10000');
    const contentLength = typeof data.content === 'string' 
      ? data.content.length 
      : JSON.stringify(data.content).length;
    
    if (contentLength > maxLength) {
      throw new InvalidInputError(`Content exceeds maximum length of ${maxLength} characters`);
    }
  }

  private extractTextContent(data: any): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    
    // Extract text from complex objects
    if (data.type === 'phone') {
      return `Phone: ${data.content.number || data.content}`;
    }
    
    if (data.type === 'transaction') {
      return JSON.stringify(data.content);
    }
    
    return data.content.text || data.content.description || JSON.stringify(data.content);
  }

  private formatRulesResult(rulesResult: any): AnalysisResult {
    return {
      isScam: rulesResult.isScam,
      confidence: rulesResult.confidence,
      category: rulesResult.category || 'other',
      severity: this.calculateSeverity(rulesResult.confidence, rulesResult.isScam),
      indicators: rulesResult.indicators,
      sentiment: 'neutral',
      explanation: `Rules-based detection: ${rulesResult.indicators.join(', ')}`,
      metadata: {
        processingTime: 0,
        modelVersion: 'rules-engine-v1',
        provider: 'rules'
      }
    };
  }

  private combineResults(rulesResult: any, aiResult: AnalysisResult): AnalysisResult {
    const weights = {
      rules: 0.3,
      ai: 0.7
    };
    
    const combinedConfidence = 
      (rulesResult.confidence * weights.rules) + 
      (aiResult.confidence * weights.ai);
    
    return {
      isScam: combinedConfidence > 0.6 || aiResult.isScam,
      confidence: Math.min(combinedConfidence, 1),
      category: aiResult.category || rulesResult.category || 'other',
      severity: this.calculateSeverity(combinedConfidence, aiResult.isScam),
      indicators: [...new Set([...rulesResult.indicators, ...aiResult.indicators])],
      sentiment: aiResult.sentiment,
      explanation: aiResult.explanation,
      metadata: aiResult.metadata
    };
  }

  private calculateSeverity(confidence: number, isScam: boolean): AnalysisResult['severity'] {
    if (!isScam) return 'low';
    if (confidence >= 0.9) return 'critical';
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  private async getFromCache(key: string): Promise<any> {
    if (!this.redis) return null;
    
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Cache get error:', error);
    }
    
    return null;
  }

  private async saveToCache(key: string, value: any): Promise<void> {
    if (!this.redis) return;
    
    try {
      await this.redis.setex(
        key,
        this.config.cacheTTL || 3600,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  private getCacheKey(data: any): string {
    const prefix = process.env.AI_CACHE_KEY_PREFIX || 'ai:analysis:';
    return `${prefix}${this.hashContent(data)}`;
  }

  private hashContent(content: any): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return createHash('md5').update(str).digest('hex');
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private updateMetrics(responseTime: number, cacheHit: boolean): void {
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
    
    this.metrics.requestsPerMinute++;
    if (!cacheHit) {
      this.metrics.apiCallsCount++;
      this.metrics.estimatedCost += this.estimateCost();
    }
    
    // Update cache hit rate
    const totalRequests = this.metrics.requestsPerMinute;
    const cacheHits = cacheHit ? 1 : 0;
    this.metrics.cacheHitRate = 
      (this.metrics.cacheHitRate * (totalRequests - 1) + cacheHits) / totalRequests;
  }

  private updateBusinessMetrics(result: AnalysisResult): void {
    if (result.isScam) {
      this.metrics.scamsDetected++;
      
      const category = result.category;
      this.metrics.categoriesBreakdown[category] = 
        (this.metrics.categoriesBreakdown[category] || 0) + 1;
    }
  }

  private calculateAvgResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  private calculatePercentile(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private estimateCost(): number {
    // Estimate based on model and tokens
    // GPT-5 pricing (hypothetical)
    const costPerRequest = 0.03; // $0.03 per request average
    return costPerRequest;
  }

  private async storeScamAlert(result: AnalysisResult, originalData: any): Promise<void> {
    // Store in database or send alert
    // This would integrate with your database
    console.log('High confidence scam detected:', {
      category: result.category,
      confidence: result.confidence,
      indicators: result.indicators,
      source: originalData.source
    });
    
    // TODO: Implement database storage when integrated
  }
}