import axios from 'axios';
import Redis from 'ioredis';
import { AIAnalysisService } from '@repo/ai';
import type { 
  AnalysisData, 
  AnalysisResult, 
  BatchAnalysisRequest 
} from '@repo/ai';

interface ValidationOptions {
  strapiUrl?: string;
  strapiToken?: string;
  useRedis?: boolean;
  redisHost?: string;
  redisPort?: number;
  streamName?: string;
  batchSize?: number;
  enableAI?: boolean;
  aiConcurrency?: number;
}

interface ScamRecord {
  id?: string;
  url: string;
  title: string;
  description: string;
  category: string;
  reportCount: number;
  lastReported: string;
  status: string;
  tags: string[];
  metadata: {
    source: string;
    crawledAt: string;
    batch?: string;
    [key: string]: any;
  };
  // AI analysis results
  aiAnalysis?: {
    isScam: boolean;
    confidence: number;
    category: string;
    severity: string;
    indicators: string[];
    sentiment: string;
    explanation: string;
    processingTime?: number;
  };
}

interface BatchMetadata {
  batchId: string;
  source: string;
  timestamp?: string;
  totalRecords?: number;
  aiProcessed?: boolean;
  aiProcessingTime?: number;
}

interface ValidationRequest {
  records: ScamRecord[];
  metadata: BatchMetadata;
  requestId: string;
  timestamp: string;
}

export default class ValidationPusherWithAI {
  private strapiUrl: string;
  private strapiToken: string;
  private useRedis: boolean;
  private redis?: Redis;
  private streamName: string;
  private batchSize: number;
  private enableAI: boolean;
  private aiService?: AIAnalysisService;
  private aiConcurrency: number;

  constructor(options: ValidationOptions = {}) {
    this.strapiUrl = options.strapiUrl || process.env.STRAPI_URL || 'http://localhost:1337';
    this.strapiToken = options.strapiToken || process.env.STRAPI_API_TOKEN || '';
    this.useRedis = options.useRedis !== false; // Default to true
    this.streamName = options.streamName || 'validation_requests';
    this.batchSize = options.batchSize || 50;
    this.enableAI = options.enableAI !== false; // Default to true
    this.aiConcurrency = options.aiConcurrency || 5;

    // Redis setup
    if (this.useRedis) {
      this.redis = new Redis({
        host: options.redisHost || process.env.REDIS_HOST || 'localhost',
        port: options.redisPort || parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy: (times: number) => Math.min(times * 100, 2000)
      });

      this.redis.on('error', (error: Error) => {
        console.warn('Redis connection error:', error.message);
        console.log('Falling back to direct Strapi push');
        this.useRedis = false;
      });
    }

    // AI Service setup
    if (this.enableAI) {
      try {
        this.aiService = new AIAnalysisService({
          provider: process.env.AI_PROVIDER || 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-5-mini',
          cacheEnabled: true,
          cacheTTL: 3600,
          rateLimitPerMinute: 100
        });
        console.log('✅ AI Service initialized for batch processing');
      } catch (error) {
        console.warn('⚠️  AI Service initialization failed:', error);
        console.log('Continuing without AI analysis');
        this.enableAI = false;
      }
    }
  }

  async pushBatch(records: ScamRecord[], metadata: BatchMetadata): Promise<void> {
    const requestId = `${metadata.batchId}_${Date.now()}`;
    
    console.log(`📤 Pushing batch to validation: ${records.length} records`);
    
    // Process with AI if enabled
    let processedRecords = records;
    let aiProcessingTime = 0;
    
    if (this.enableAI && this.aiService) {
      const startTime = Date.now();
      processedRecords = await this.processWithAI(records);
      aiProcessingTime = Date.now() - startTime;
      
      metadata.aiProcessed = true;
      metadata.aiProcessingTime = aiProcessingTime;
      
      console.log(`🤖 AI processing completed in ${(aiProcessingTime / 1000).toFixed(2)}s`);
    }

    // Split into smaller batches if needed
    const batches = this.chunkArray(processedRecords, this.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchRequestId = `${requestId}_${i + 1}`;
      
      const validationRequest: ValidationRequest = {
        records: batch,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          totalRecords: batch.length
        },
        requestId: batchRequestId,
        timestamp: new Date().toISOString()
      };

      try {
        if (this.useRedis && this.redis) {
          await this.pushToRedisStream(validationRequest);
        } else {
          await this.pushToStrapi(validationRequest);
        }
        
        console.log(`✅ Pushed batch ${i + 1}/${batches.length}: ${batch.length} records`);
        
      } catch (error) {
        console.error(`❌ Failed to push batch ${i + 1}/${batches.length}:`, error);
        
        // Try fallback method
        try {
          if (this.useRedis && this.redis) {
            console.log('🔄 Falling back to direct Strapi push');
            await this.pushToStrapi(validationRequest);
            console.log(`✅ Fallback successful for batch ${i + 1}`);
          }
        } catch (fallbackError) {
          console.error(`💥 Fallback also failed for batch ${i + 1}:`, fallbackError);
          throw fallbackError;
        }
      }
    }

    console.log(`🎉 All batches pushed successfully: ${records.length} total records`);
    
    // Log AI metrics if available
    if (this.enableAI && this.aiService) {
      const metrics = this.aiService.getMetrics();
      console.log('📊 AI Processing Metrics:');
      console.log(`  - Total API calls: ${metrics.apiCallsCount}`);
      console.log(`  - Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
      console.log(`  - Scams detected: ${metrics.scamsDetected}`);
      console.log(`  - Estimated cost: $${metrics.estimatedCost.toFixed(4)}`);
      console.log(`  - Avg response time: ${metrics.avgResponseTime.toFixed(0)}ms`);
    }
  }

  private async processWithAI(records: ScamRecord[]): Promise<ScamRecord[]> {
    if (!this.aiService) return records;

    console.log(`🤖 Starting AI analysis for ${records.length} records...`);
    
    // Create batch analysis items
    const analysisItems: AnalysisData[] = records.map((record, index) => ({
      id: record.id || `record_${index}`,
      type: this.determineContentType(record),
      content: this.extractAnalysisContent(record),
      source: record.metadata.source,
      metadata: {
        url: record.url,
        category: record.category,
        reportCount: record.reportCount
      }
    }));

    // Process in batches with concurrency control
    const chunks = this.chunkArray(analysisItems, this.batchSize);
    const processedRecords: ScamRecord[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`  📝 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} items)`);
      
      try {
        // Use the batch analysis method
        const batchRequest: BatchAnalysisRequest = {
          items: chunk
        };
        
        const batchResult = await this.aiService.analyzeBatch(batchRequest);
        
        // Map results back to records
        for (const result of batchResult.results) {
          const recordIndex = records.findIndex(r => 
            (r.id || `record_${records.indexOf(r)}`) === result.id
          );
          
          if (recordIndex !== -1 && result.analysis) {
            const analysis = result.analysis as AnalysisResult;
            records[recordIndex].aiAnalysis = {
              isScam: analysis.isScam,
              confidence: analysis.confidence,
              category: analysis.category,
              severity: analysis.severity,
              indicators: analysis.indicators,
              sentiment: analysis.sentiment,
              explanation: analysis.explanation,
              processingTime: analysis.metadata?.processingTime
            };
            
            // Update record status based on AI analysis
            if (analysis.isScam && analysis.confidence > 0.8) {
              records[recordIndex].status = 'confirmed_scam';
              records[recordIndex].tags.push('ai_verified');
            } else if (analysis.isScam && analysis.confidence > 0.5) {
              records[recordIndex].status = 'suspected_scam';
              records[recordIndex].tags.push('ai_suspected');
            }
          }
        }
        
        console.log(`  ✅ Chunk ${i + 1} processed: ${batchResult.successCount} success, ${batchResult.failureCount} failed`);
        
      } catch (error) {
        console.error(`  ❌ Failed to process chunk ${i + 1}:`, error);
        // Continue with other chunks even if one fails
      }
    }
    
    return records;
  }

  private determineContentType(record: ScamRecord): 'phone' | 'transaction' | 'review' | 'general' {
    // Determine type based on record content
    if (record.category.toLowerCase().includes('phone') || 
        record.title.toLowerCase().includes('số điện thoại')) {
      return 'phone';
    }
    
    if (record.category.toLowerCase().includes('review') || 
        record.category.toLowerCase().includes('đánh giá')) {
      return 'review';
    }
    
    if (record.category.toLowerCase().includes('giao dịch') || 
        record.category.toLowerCase().includes('transaction')) {
      return 'transaction';
    }
    
    return 'general';
  }

  private extractAnalysisContent(record: ScamRecord): string {
    // Combine relevant fields for analysis
    const contentParts: string[] = [];
    
    if (record.title) contentParts.push(`Title: ${record.title}`);
    if (record.description) contentParts.push(`Description: ${record.description}`);
    if (record.category) contentParts.push(`Category: ${record.category}`);
    if (record.tags.length > 0) contentParts.push(`Tags: ${record.tags.join(', ')}`);
    
    // Add metadata if relevant
    if (record.reportCount > 0) {
      contentParts.push(`Reports: ${record.reportCount}`);
    }
    
    return contentParts.join('\n');
  }

  private async pushToRedisStream(request: ValidationRequest): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    const streamData = {
      requestId: request.requestId,
      timestamp: request.timestamp,
      batchId: request.metadata.batchId,
      source: request.metadata.source,
      recordCount: request.records.length.toString(),
      aiProcessed: request.metadata.aiProcessed ? 'true' : 'false',
      payload: JSON.stringify(request)
    };

    await this.redis.xadd(
      this.streamName,
      '*', // Auto-generate ID
      'data', JSON.stringify(streamData)
    );

    console.log(`📡 Pushed to Redis stream: ${this.streamName}`);
  }

  private async pushToStrapi(request: ValidationRequest): Promise<void> {
    if (!this.strapiToken) {
      console.warn('⚠️  No Strapi API token provided, skipping direct push');
      return;
    }

    const endpoint = `${this.strapiUrl}/api/importer/validation-requests`;
    
    const response = await axios.post(endpoint, {
      data: {
        requestId: request.requestId,
        batchId: request.metadata.batchId,
        source: request.metadata.source,
        recordCount: request.records.length,
        aiProcessed: request.metadata.aiProcessed || false,
        payload: request,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    }, {
      headers: {
        'Authorization': `Bearer ${this.strapiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Strapi API error: ${response.status} ${response.statusText}`);
    }

    console.log(`📨 Pushed to Strapi API: ${endpoint}`);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  // Test connection
  async testConnection(): Promise<{ redis: boolean; strapi: boolean; ai: boolean }> {
    const results = { redis: false, strapi: false, ai: false };

    // Test Redis
    if (this.useRedis && this.redis) {
      try {
        await this.redis.ping();
        results.redis = true;
        console.log('✅ Redis connection OK');
      } catch (error) {
        console.warn('❌ Redis connection failed:', error);
      }
    }

    // Test Strapi
    if (this.strapiToken) {
      try {
        const response = await axios.get(`${this.strapiUrl}/api/users/me`, {
          headers: { 'Authorization': `Bearer ${this.strapiToken}` },
          timeout: 5000
        });
        
        if (response.status === 200) {
          results.strapi = true;
          console.log('✅ Strapi API connection OK');
        }
      } catch (error) {
        console.warn('❌ Strapi API connection failed:', error);
      }
    }

    // Test AI Service
    if (this.enableAI && this.aiService) {
      try {
        const testResult = await this.aiService.analyzeContent({
          type: 'general',
          content: 'Test connection',
          source: 'test'
        });
        
        if (testResult) {
          results.ai = true;
          console.log('✅ AI Service connection OK');
        }
      } catch (error) {
        console.warn('❌ AI Service connection failed:', error);
      }
    }

    return results;
  }
}

// Example usage with AI
async function exampleUsage() {
  const pusher = new ValidationPusherWithAI({
    enableAI: true,
    batchSize: 50,
    aiConcurrency: 5
  });

  // Sample records
  const sampleRecords: ScamRecord[] = [
    {
      url: 'https://checkscam.vn/scam/1',
      title: 'Lừa đảo chuyển tiền qua ngân hàng',
      description: 'Yêu cầu chuyển tiền trước khi nhận hàng, cung cấp mã OTP',
      category: 'financial',
      reportCount: 150,
      lastReported: '2024-01-15',
      status: 'reported',
      tags: ['banking', 'otp', 'money_transfer'],
      metadata: {
        source: 'checkscam.vn',
        crawledAt: new Date().toISOString()
      }
    },
    {
      url: 'https://checkscam.vn/phone/1900588888',
      title: 'Số điện thoại lừa đảo 1900588888',
      description: 'Số điện thoại tính cước cao, gọi liên tục',
      category: 'phone',
      reportCount: 500,
      lastReported: '2024-01-14',
      status: 'reported',
      tags: ['premium_number', 'spam'],
      metadata: {
        source: 'checkscam.vn',
        crawledAt: new Date().toISOString()
      }
    }
  ];

  const metadata: BatchMetadata = {
    batchId: `batch_${Date.now()}`,
    source: 'checkscam.vn',
    timestamp: new Date().toISOString(),
    totalRecords: sampleRecords.length
  };

  try {
    // Test connections
    const connections = await pusher.testConnection();
    console.log('Connection status:', connections);

    // Push batch with AI processing
    await pusher.pushBatch(sampleRecords, metadata);
    
    console.log('✅ Example completed successfully');
  } catch (error) {
    console.error('❌ Example failed:', error);
  } finally {
    await pusher.close();
  }
}

// CLI support for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (command === 'test') {
    const pusher = new ValidationPusherWithAI();
    pusher.testConnection()
      .then((results) => {
        console.log('Connection test results:', results);
        process.exit(results.redis || results.strapi || results.ai ? 0 : 1);
      })
      .catch((error) => {
        console.error('Test failed:', error);
        process.exit(1);
      })
      .finally(() => {
        pusher.close();
      });
  } else if (command === 'example') {
    exampleUsage()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log('Usage:');
    console.log('  node push-to-validation-with-ai.js test     # Test connections');
    console.log('  node push-to-validation-with-ai.js example  # Run example');
  }
}

export { ValidationPusherWithAI };