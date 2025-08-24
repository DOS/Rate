import OpenAI from 'openai';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Types
interface Review {
  id: number;
  username: string;
  comment: string | null;
  star_rate: number;
  product_name: string;
  seller_name: string;
  price: number;
  images_count: number;
  videos_count: number;
}

interface AnalysisResult {
  review_id: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentiment_score: number; // -1 to 1
  is_fake: boolean;
  fake_probability: number; // 0 to 1
  spam_detected: boolean;
  key_topics: string[];
  pros: string[];
  cons: string[];
  product_aspects: {
    quality?: number;
    price_value?: number;
    delivery?: number;
    packaging?: number;
    customer_service?: number;
  };
  flags: string[]; // suspicious patterns
  summary: string;
}

export class ReviewAnalyzer {
  private openai: OpenAI;
  private pgPool: Pool;
  private redis: Redis;
  
  constructor() {
    // Initialize OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
    
    // Initialize PostgreSQL
    this.pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rate_db',
      user: process.env.DB_USER || 'JOY',
      password: process.env.DB_PASSWORD || '***REMOVED-SECRET***',
    });
    
    // Initialize Redis for caching
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }
  
  async analyzeReview(review: Review): Promise<AnalysisResult> {
    // Check cache first
    const cacheKey = `review_analysis:${review.id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Prepare prompt for AI
    const prompt = this.buildAnalysisPrompt(review);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert in analyzing Vietnamese e-commerce reviews. 
            Analyze reviews for sentiment, authenticity, and extract key insights.
            Respond in JSON format only.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      // Process and validate result
      const analysis: AnalysisResult = {
        review_id: review.id,
        sentiment: result.sentiment || 'neutral',
        sentiment_score: result.sentiment_score || 0,
        is_fake: result.is_fake || false,
        fake_probability: result.fake_probability || 0,
        spam_detected: result.spam_detected || false,
        key_topics: result.key_topics || [],
        pros: result.pros || [],
        cons: result.cons || [],
        product_aspects: result.product_aspects || {},
        flags: result.flags || [],
        summary: result.summary || ''
      };
      
      // Cache result for 7 days
      await this.redis.setex(cacheKey, 7 * 24 * 60 * 60, JSON.stringify(analysis));
      
      // Save to database
      await this.saveAnalysis(analysis);
      
      return analysis;
      
    } catch (error) {
      console.error('Error analyzing review:', error);
      throw error;
    }
  }
  
  private buildAnalysisPrompt(review: Review): string {
    return `
Analyze this Vietnamese e-commerce review:

Username: ${review.username}
Rating: ${review.star_rate}/5 stars
Comment: ${review.comment || '[No comment, only rating]'}
Product: ${review.product_name}
Seller: ${review.seller_name}
Price: ${review.price?.toLocaleString()} VND
Has images: ${review.images_count > 0 ? `Yes (${review.images_count})` : 'No'}
Has videos: ${review.videos_count > 0 ? `Yes (${review.videos_count})` : 'No'}

Please analyze and return JSON with:
1. sentiment: overall sentiment (positive/negative/neutral/mixed)
2. sentiment_score: numeric score from -1 (very negative) to 1 (very positive)
3. is_fake: boolean indicating if review seems fake
4. fake_probability: probability score 0-1
5. spam_detected: boolean for spam detection
6. key_topics: array of main topics mentioned
7. pros: positive aspects mentioned
8. cons: negative aspects mentioned
9. product_aspects: scores for quality, price_value, delivery, packaging, customer_service (0-5 each, if mentioned)
10. flags: array of suspicious patterns (e.g., "too generic", "excessive praise", "competitor mention")
11. summary: brief summary in Vietnamese

Consider these fake review indicators:
- Generic comments without specifics
- Excessive use of superlatives
- Mismatch between rating and comment sentiment
- Very short comment for high rating
- Repetitive phrases
- No mention of actual product experience
`;
  }
  
  async analyzeBatch(limit: number = 10): Promise<AnalysisResult[]> {
    // Get unanalyzed reviews from database
    const client = await this.pgPool.connect();
    
    try {
      const query = `
        SELECT 
          vi.id,
          vi.username,
          vi.comment,
          vi.star_rate,
          vi.product_name,
          vi.seller_name,
          vi.price,
          vi.images_count,
          vi.videos_count
        FROM validated_items vi
        LEFT JOIN ai_analysis aa ON vi.id = aa.review_id
        WHERE vi.item_type = 'review'
          AND vi.comment IS NOT NULL
          AND aa.id IS NULL
        ORDER BY vi.created_at DESC
        LIMIT $1
      `;
      
      const result = await client.query(query, [limit]);
      const reviews = result.rows;
      
      console.log(`Found ${reviews.length} reviews to analyze`);
      
      const analyses: AnalysisResult[] = [];
      
      for (const review of reviews) {
        console.log(`Analyzing review ${review.id}...`);
        try {
          const analysis = await this.analyzeReview(review);
          analyses.push(analysis);
          console.log(`✓ Review ${review.id}: ${analysis.sentiment} (fake prob: ${analysis.fake_probability})`);
        } catch (error) {
          console.error(`✗ Failed to analyze review ${review.id}:`, error);
        }
        
        // Rate limiting - wait between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return analyses;
      
    } finally {
      client.release();
    }
  }
  
  private async saveAnalysis(analysis: AnalysisResult): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      // Create table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_analysis (
          id SERIAL PRIMARY KEY,
          review_id INTEGER REFERENCES validated_items(id),
          sentiment VARCHAR(20),
          sentiment_score DECIMAL(3,2),
          is_fake BOOLEAN,
          fake_probability DECIMAL(3,2),
          spam_detected BOOLEAN,
          key_topics JSONB,
          pros JSONB,
          cons JSONB,
          product_aspects JSONB,
          flags JSONB,
          summary TEXT,
          model_used VARCHAR(50) DEFAULT 'gpt-4-turbo',
          analyzed_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(review_id)
        )
      `);
      
      // Insert or update analysis
      await client.query(`
        INSERT INTO ai_analysis (
          review_id, sentiment, sentiment_score,
          is_fake, fake_probability, spam_detected,
          key_topics, pros, cons, product_aspects,
          flags, summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (review_id) 
        DO UPDATE SET
          sentiment = EXCLUDED.sentiment,
          sentiment_score = EXCLUDED.sentiment_score,
          is_fake = EXCLUDED.is_fake,
          fake_probability = EXCLUDED.fake_probability,
          spam_detected = EXCLUDED.spam_detected,
          key_topics = EXCLUDED.key_topics,
          pros = EXCLUDED.pros,
          cons = EXCLUDED.cons,
          product_aspects = EXCLUDED.product_aspects,
          flags = EXCLUDED.flags,
          summary = EXCLUDED.summary,
          analyzed_at = NOW()
      `, [
        analysis.review_id,
        analysis.sentiment,
        analysis.sentiment_score,
        analysis.is_fake,
        analysis.fake_probability,
        analysis.spam_detected,
        JSON.stringify(analysis.key_topics),
        JSON.stringify(analysis.pros),
        JSON.stringify(analysis.cons),
        JSON.stringify(analysis.product_aspects),
        JSON.stringify(analysis.flags),
        analysis.summary
      ]);
      
    } finally {
      client.release();
    }
  }
  
  async getStatistics(): Promise<any> {
    const client = await this.pgPool.connect();
    
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_analyzed,
          COUNT(CASE WHEN is_fake = true THEN 1 END) as fake_count,
          COUNT(CASE WHEN spam_detected = true THEN 1 END) as spam_count,
          AVG(sentiment_score) as avg_sentiment,
          AVG(fake_probability) as avg_fake_prob,
          COUNT(CASE WHEN sentiment = 'positive' THEN 1 END) as positive_count,
          COUNT(CASE WHEN sentiment = 'negative' THEN 1 END) as negative_count,
          COUNT(CASE WHEN sentiment = 'neutral' THEN 1 END) as neutral_count
        FROM ai_analysis
      `);
      
      return stats.rows[0];
      
    } finally {
      client.release();
    }
  }
  
  async cleanup(): Promise<void> {
    await this.redis.quit();
    await this.pgPool.end();
  }
}

// CLI interface
if (require.main === module) {
  const analyzer = new ReviewAnalyzer();
  
  const command = process.argv[2];
  const limit = parseInt(process.argv[3] || '10');
  
  async function run() {
    try {
      switch (command) {
        case 'analyze':
          console.log(`Analyzing ${limit} reviews...`);
          const results = await analyzer.analyzeBatch(limit);
          console.log(`\nAnalyzed ${results.length} reviews`);
          
          const fakeCount = results.filter(r => r.is_fake).length;
          const spamCount = results.filter(r => r.spam_detected).length;
          
          console.log(`Found ${fakeCount} fake reviews`);
          console.log(`Found ${spamCount} spam reviews`);
          break;
          
        case 'stats':
          const stats = await analyzer.getStatistics();
          console.log('\n📊 AI Analysis Statistics:');
          console.log('─'.repeat(40));
          console.log(`Total analyzed: ${stats.total_analyzed}`);
          console.log(`Fake reviews: ${stats.fake_count} (${Math.round(stats.fake_count/stats.total_analyzed*100)}%)`);
          console.log(`Spam detected: ${stats.spam_count}`);
          console.log(`Average sentiment: ${parseFloat(stats.avg_sentiment).toFixed(2)}`);
          console.log(`Average fake probability: ${parseFloat(stats.avg_fake_prob).toFixed(2)}`);
          console.log(`\nSentiment distribution:`);
          console.log(`  Positive: ${stats.positive_count}`);
          console.log(`  Negative: ${stats.negative_count}`);
          console.log(`  Neutral: ${stats.neutral_count}`);
          break;
          
        default:
          console.log('Usage: tsx review-analyzer.ts [analyze|stats] [limit]');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      await analyzer.cleanup();
    }
  }
  
  run();
}