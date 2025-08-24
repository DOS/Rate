import { Pool } from 'pg';

interface ReviewAnalysis {
  review_id: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentiment_score: number;
  is_suspicious: boolean;
  suspicious_reasons: string[];
  key_phrases: string[];
  summary: string;
}

export class SimpleReviewAnalyzer {
  private pgPool: Pool;
  
  // Keywords for sentiment analysis
  private positiveWords = [
    'tốt', 'đẹp', 'ngon', 'chất lượng', 'hài lòng', 'tuyệt vời', 'xuất sắc',
    'nhanh', 'ok', 'ổn', 'thích', 'yêu', 'hoàn hảo', 'xịn', 'chính hãng',
    'đáng tiền', 'rẻ', 'tiện', 'dễ', 'mượt', 'bền', 'sang', 'pro'
  ];
  
  private negativeWords = [
    'tệ', 'xấu', 'kém', 'chậm', 'lỗi', 'hỏng', 'fake', 'giả', 'lừa',
    'thất vọng', 'tức', 'quá đắt', 'không đáng', 'dở', 'nhầm', 'sai',
    'hư', 'vỡ', 'rách', 'bẩn', 'cũ', 'khác', 'không giống'
  ];
  
  constructor() {
    this.pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rate_db',
      user: process.env.DB_USER || 'JOY',
      password: process.env.DB_PASSWORD || '***REMOVED-SECRET***',
    });
  }
  
  private analyzeText(text: string): {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    keywords: string[];
  } {
    if (!text) {
      return { sentiment: 'neutral', score: 0, keywords: [] };
    }
    
    const lowerText = text.toLowerCase();
    const foundKeywords: string[] = [];
    
    // Count positive and negative words
    let positiveCount = 0;
    let negativeCount = 0;
    
    for (const word of this.positiveWords) {
      if (lowerText.includes(word)) {
        positiveCount++;
        foundKeywords.push('+' + word);
      }
    }
    
    for (const word of this.negativeWords) {
      if (lowerText.includes(word)) {
        negativeCount++;
        foundKeywords.push('-' + word);
      }
    }
    
    // Calculate sentiment score (-1 to 1)
    const total = positiveCount + negativeCount;
    let score = 0;
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    
    if (total > 0) {
      score = (positiveCount - negativeCount) / total;
      
      if (score > 0.3) sentiment = 'positive';
      else if (score < -0.3) sentiment = 'negative';
      else sentiment = 'neutral';
    }
    
    return { sentiment, score, keywords: foundKeywords };
  }
  
  private detectSuspiciousPatterns(review: any): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    
    // Check 1: Rating vs Comment mismatch
    if (review.star_rate >= 4 && review.comment) {
      const analysis = this.analyzeText(review.comment);
      if (analysis.sentiment === 'negative') {
        reasons.push('Rating cao nhưng comment tiêu cực');
      }
    } else if (review.star_rate <= 2 && review.comment) {
      const analysis = this.analyzeText(review.comment);
      if (analysis.sentiment === 'positive') {
        reasons.push('Rating thấp nhưng comment tích cực');
      }
    }
    
    // Check 2: Too short comment for 5 stars
    if (review.star_rate === 5 && review.comment && review.comment.length < 20) {
      reasons.push('Comment quá ngắn cho 5 sao');
    }
    
    // Check 3: Generic comment
    const genericPhrases = ['sản phẩm tốt', 'hàng ok', 'ship nhanh', 'đóng gói cẩn thận'];
    if (review.comment) {
      const lowerComment = review.comment.toLowerCase();
      const hasOnlyGeneric = genericPhrases.some(phrase => 
        lowerComment === phrase || lowerComment === phrase + '.'
      );
      if (hasOnlyGeneric) {
        reasons.push('Comment quá chung chung');
      }
    }
    
    // Check 4: No comment but 1 star
    if (review.star_rate === 1 && !review.comment) {
      reasons.push('1 sao nhưng không có comment giải thích');
    }
    
    // Check 5: Repetitive exclamation
    if (review.comment && (review.comment.match(/!/g) || []).length > 3) {
      reasons.push('Quá nhiều dấu chấm than');
    }
    
    return {
      isSuspicious: reasons.length > 0,
      reasons
    };
  }
  
  async analyzeReview(reviewId: number): Promise<ReviewAnalysis> {
    const client = await this.pgPool.connect();
    
    try {
      // Get review data
      const result = await client.query(`
        SELECT 
          id, username, comment, star_rate,
          product_name, seller_name, price
        FROM validated_items
        WHERE id = $1 AND item_type = 'review'
      `, [reviewId]);
      
      if (result.rows.length === 0) {
        throw new Error('Review not found');
      }
      
      const review = result.rows[0];
      
      // Analyze sentiment
      const sentimentAnalysis = this.analyzeText(review.comment || '');
      
      // Detect suspicious patterns
      const suspiciousCheck = this.detectSuspiciousPatterns(review);
      
      // Generate summary
      let summary = `Review ${review.star_rate} sao`;
      if (sentimentAnalysis.sentiment === 'positive') {
        summary += ' với nội dung tích cực';
      } else if (sentimentAnalysis.sentiment === 'negative') {
        summary += ' với nội dung tiêu cực';
      } else if (!review.comment) {
        summary += ' không có comment';
      } else {
        summary += ' với nội dung trung lập';
      }
      
      if (suspiciousCheck.isSuspicious) {
        summary += '. ⚠️ Có dấu hiệu đáng ngờ';
      }
      
      const analysis: ReviewAnalysis = {
        review_id: review.id,
        sentiment: sentimentAnalysis.sentiment,
        sentiment_score: sentimentAnalysis.score,
        is_suspicious: suspiciousCheck.isSuspicious,
        suspicious_reasons: suspiciousCheck.reasons,
        key_phrases: sentimentAnalysis.keywords,
        summary
      };
      
      // Save analysis
      await this.saveAnalysis(analysis);
      
      return analysis;
      
    } finally {
      client.release();
    }
  }
  
  async analyzeBatch(limit: number = 20): Promise<ReviewAnalysis[]> {
    const client = await this.pgPool.connect();
    
    try {
      // Create table if not exists first
      await this.createTableIfNotExists();
      
      // Get unanalyzed reviews
      const result = await client.query(`
        SELECT id
        FROM validated_items vi
        WHERE vi.item_type = 'review'
          AND NOT EXISTS (
            SELECT 1 FROM simple_ai_analysis saa 
            WHERE saa.review_id = vi.id
          )
        ORDER BY vi.created_at DESC
        LIMIT $1
      `, [limit]);
      
      const analyses: ReviewAnalysis[] = [];
      
      console.log(`🤖 Analyzing ${result.rows.length} reviews...`);
      
      for (const row of result.rows) {
        try {
          const analysis = await this.analyzeReview(row.id);
          analyses.push(analysis);
          
          const icon = analysis.is_suspicious ? '⚠️' : '✅';
          console.log(`${icon} Review ${row.id}: ${analysis.sentiment} (suspicious: ${analysis.is_suspicious})`);
        } catch (error) {
          console.error(`Failed to analyze review ${row.id}:`, error);
        }
      }
      
      return analyses;
      
    } finally {
      client.release();
    }
  }
  
  private async createTableIfNotExists(): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS simple_ai_analysis (
          id SERIAL PRIMARY KEY,
          review_id INTEGER REFERENCES validated_items(id),
          sentiment VARCHAR(20),
          sentiment_score DECIMAL(3,2),
          is_suspicious BOOLEAN,
          suspicious_reasons JSONB,
          key_phrases JSONB,
          summary TEXT,
          analyzed_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(review_id)
        )
      `);
      
    } finally {
      client.release();
    }
  }
  
  private async saveAnalysis(analysis: ReviewAnalysis): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      // Save analysis
      await client.query(`
        INSERT INTO simple_ai_analysis (
          review_id, sentiment, sentiment_score,
          is_suspicious, suspicious_reasons,
          key_phrases, summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (review_id) DO UPDATE SET
          sentiment = EXCLUDED.sentiment,
          sentiment_score = EXCLUDED.sentiment_score,
          is_suspicious = EXCLUDED.is_suspicious,
          suspicious_reasons = EXCLUDED.suspicious_reasons,
          key_phrases = EXCLUDED.key_phrases,
          summary = EXCLUDED.summary,
          analyzed_at = NOW()
      `, [
        analysis.review_id,
        analysis.sentiment,
        analysis.sentiment_score,
        analysis.is_suspicious,
        JSON.stringify(analysis.suspicious_reasons),
        JSON.stringify(analysis.key_phrases),
        analysis.summary
      ]);
      
    } finally {
      client.release();
    }
  }
  
  async getStatistics(): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN sentiment = 'positive' THEN 1 END) as positive,
          COUNT(CASE WHEN sentiment = 'negative' THEN 1 END) as negative,
          COUNT(CASE WHEN sentiment = 'neutral' THEN 1 END) as neutral,
          COUNT(CASE WHEN is_suspicious = true THEN 1 END) as suspicious,
          AVG(sentiment_score) as avg_score
        FROM simple_ai_analysis
      `);
      
      const topReasons = await client.query(`
        SELECT 
          jsonb_array_elements_text(suspicious_reasons) as reason,
          COUNT(*) as count
        FROM simple_ai_analysis
        WHERE is_suspicious = true
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 5
      `);
      
      console.log('\n📊 PHÂN TÍCH REVIEW BẰNG AI (Simple Version):');
      console.log('='.repeat(50));
      
      const s = stats.rows[0];
      console.log(`\n📈 Tổng quan:`);
      console.log(`  Total analyzed: ${s.total}`);
      console.log(`  Positive: ${s.positive} (${Math.round(s.positive/s.total*100)}%)`);
      console.log(`  Negative: ${s.negative} (${Math.round(s.negative/s.total*100)}%)`);
      console.log(`  Neutral: ${s.neutral} (${Math.round(s.neutral/s.total*100)}%)`);
      console.log(`  Suspicious: ${s.suspicious} (${Math.round(s.suspicious/s.total*100)}%)`);
      console.log(`  Avg sentiment: ${parseFloat(s.avg_score).toFixed(2)}`);
      
      if (topReasons.rows.length > 0) {
        console.log(`\n⚠️  Top lý do nghi ngờ:`);
        topReasons.rows.forEach((r, i) => {
          console.log(`  ${i+1}. ${r.reason} (${r.count} lần)`);
        });
      }
      
      // Show sample suspicious reviews
      const suspicious = await client.query(`
        SELECT 
          vi.username,
          vi.star_rate,
          vi.comment,
          saa.suspicious_reasons
        FROM simple_ai_analysis saa
        JOIN validated_items vi ON saa.review_id = vi.id
        WHERE saa.is_suspicious = true
        LIMIT 3
      `);
      
      if (suspicious.rows.length > 0) {
        console.log(`\n🔍 Ví dụ review đáng ngờ:`);
        suspicious.rows.forEach((r, i) => {
          console.log(`\n  ${i+1}. ${r.username} - ${r.star_rate} sao`);
          console.log(`     "${r.comment || '[No comment]'}"`);
          try {
            const reasons = typeof r.suspicious_reasons === 'string' 
              ? JSON.parse(r.suspicious_reasons) 
              : r.suspicious_reasons;
            console.log(`     Lý do: ${reasons.join(', ')}`);
          } catch (e) {
            console.log(`     Lý do: ${r.suspicious_reasons}`);
          }
        });
      }
      
    } finally {
      client.release();
    }
  }
  
  async cleanup(): Promise<void> {
    await this.pgPool.end();
  }
}

// CLI
if (require.main === module) {
  const analyzer = new SimpleReviewAnalyzer();
  
  async function run() {
    const command = process.argv[2] || 'analyze';
    
    try {
      switch (command) {
        case 'analyze':
          const limit = parseInt(process.argv[3] || '20');
          const results = await analyzer.analyzeBatch(limit);
          console.log(`\n✅ Analyzed ${results.length} reviews`);
          
          const suspicious = results.filter(r => r.is_suspicious);
          if (suspicious.length > 0) {
            console.log(`⚠️  Found ${suspicious.length} suspicious reviews`);
          }
          break;
          
        case 'stats':
          await analyzer.getStatistics();
          break;
          
        default:
          console.log('Usage: tsx simple-analyzer.ts [analyze|stats] [limit]');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      await analyzer.cleanup();
    }
  }
  
  run();
}