import { Pool } from 'pg';

interface ReviewScore {
  review_id: number;
  username: string;
  star_rate: number;
  comment: string | null;
  trust_score: number; // 0-100
  is_fake: boolean;
  suspicious_reasons: string[];
  should_filter: boolean;
}

interface FilteredStats {
  total_reviews: number;
  filtered_count: number;
  filtered_percentage: number;
  original_rating: number;
  filtered_rating: number;
  rating_difference: number;
  by_reason: { [key: string]: number };
}

export class ReviewFilter {
  private pgPool: Pool;
  private suspiciousThreshold: number = 60; // Trust score < 60 = suspicious
  private fakeThreshold: number = 30; // Trust score < 30 = likely fake
  
  constructor() {
    this.pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rate_db',
      user: process.env.DB_USER || 'JOY',
      password: process.env.DB_PASSWORD || '***REMOVED-SECRET***',
    });
  }
  
  /**
   * Tính trust score dựa trên kết quả phân tích AI
   * 100 = Hoàn toàn đáng tin
   * 0 = Chắc chắn fake
   */
  private calculateTrustScore(review: any, aiAnalysis: any): number {
    let score = 100;
    
    // Dùng kết quả AI đã phân tích
    if (!aiAnalysis) {
      // Nếu chưa phân tích bằng AI thì trust score = 50 (neutral)
      return 50;
    }
    
    // 1. AI đã phát hiện suspicious (-40 điểm)
    if (aiAnalysis.is_suspicious) {
      score -= 40;
      
      // Parse suspicious reasons từ AI
      const reasons = typeof aiAnalysis.suspicious_reasons === 'string' 
        ? JSON.parse(aiAnalysis.suspicious_reasons) 
        : aiAnalysis.suspicious_reasons;
      
      // Mỗi lý do suspicious thêm -10 điểm
      if (reasons && reasons.length > 0) {
        score -= Math.min(reasons.length * 10, 30); // Max -30 cho reasons
      }
    }
    
    // 2. Sentiment score từ AI
    // Sentiment càng cực đoan (gần -1 hoặc 1) mà không có lý do rõ ràng = đáng ngờ
    const sentimentScore = parseFloat(aiAnalysis.sentiment_score || 0);
    
    if (Math.abs(sentimentScore) > 0.8) {
      // Sentiment rất mạnh
      if (!review.comment || review.comment.length < 50) {
        score -= 20; // Comment ngắn mà sentiment mạnh = fake
      }
    } else if (Math.abs(sentimentScore) < 0.1 && review.star_rate !== 3) {
      // Sentiment neutral nhưng rating cực đoan
      if (review.star_rate === 1 || review.star_rate === 5) {
        score -= 15;
      }
    }
    
    // 3. Sentiment không khớp với rating
    if (aiAnalysis.sentiment === 'positive' && review.star_rate <= 2) {
      score -= 30;
    } else if (aiAnalysis.sentiment === 'negative' && review.star_rate >= 4) {
      score -= 30;
    }
    
    // 4. Bonus cho review có media (+15 điểm)
    if (review.images_count > 0) {
      score += 10;
    }
    if (review.videos_count > 0) {
      score += 5;
    }
    
    // 5. Username pattern check (-10 điểm)
    if (this.isGeneratedUsername(review.username)) {
      score -= 10;
    }
    
    // 6. Key phrases từ AI
    if (aiAnalysis.key_phrases) {
      const phrases = typeof aiAnalysis.key_phrases === 'string'
        ? JSON.parse(aiAnalysis.key_phrases)
        : aiAnalysis.key_phrases;
      
      // Nếu có nhiều từ khóa tích cực/tiêu cực = review chân thực hơn
      if (phrases && phrases.length > 3) {
        score += 5;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  private isGeneratedUsername(username: string): boolean {
    if (!username) return true;
    
    // Check for patterns like: h***., user123, random strings
    const patterns = [
      /^[a-z]\*+\.?$/i, // h***.
      /^user\d+$/i, // user123
      /^[a-z]{8,}$/i, // random lowercase
      /^[a-z0-9_]{10,}$/i // random alphanumeric
    ];
    
    return patterns.some(pattern => pattern.test(username));
  }
  
  async processReviews(productId?: string): Promise<FilteredStats> {
    const client = await this.pgPool.connect();
    
    try {
      // Get all reviews with analysis
      let query = `
        SELECT 
          vi.*,
          saa.sentiment,
          saa.sentiment_score,
          saa.is_suspicious,
          saa.suspicious_reasons,
          saa.key_phrases
        FROM validated_items vi
        LEFT JOIN simple_ai_analysis saa ON vi.id = saa.review_id
        WHERE vi.item_type = 'review'
      `;
      
      const params: any[] = [];
      if (productId) {
        query += ' AND vi.product_id = $1';
        params.push(productId);
      }
      
      const result = await client.query(query, params);
      const reviews = result.rows;
      
      console.log(`\n🔍 PHÂN TÍCH ${reviews.length} REVIEWS...`);
      console.log('='.repeat(50));
      
      const reviewScores: ReviewScore[] = [];
      const reasonCount: { [key: string]: number } = {};
      
      for (const review of reviews) {
        // Tính trust score dựa trên AI analysis
        const trustScore = this.calculateTrustScore(review, review);
        const isFake = trustScore < this.fakeThreshold;
        const shouldFilter = trustScore < this.suspiciousThreshold;
        
        const reasons: string[] = [];
        if (review.is_suspicious && review.suspicious_reasons) {
          const parsedReasons = typeof review.suspicious_reasons === 'string'
            ? JSON.parse(review.suspicious_reasons)
            : review.suspicious_reasons;
          reasons.push(...parsedReasons);
          
          // Count reasons
          parsedReasons.forEach((reason: string) => {
            reasonCount[reason] = (reasonCount[reason] || 0) + 1;
          });
        }
        
        reviewScores.push({
          review_id: review.id,
          username: review.username,
          star_rate: review.star_rate,
          comment: review.comment,
          trust_score: trustScore,
          is_fake: isFake,
          suspicious_reasons: reasons,
          should_filter: shouldFilter
        });
        
        // Save trust score to database
        await this.saveTrustScore(review.id, trustScore, isFake, shouldFilter);
      }
      
      // Calculate statistics
      const filteredReviews = reviewScores.filter(r => !r.should_filter);
      const originalRating = this.calculateAverage(reviewScores.map(r => r.star_rate));
      const filteredRating = this.calculateAverage(filteredReviews.map(r => r.star_rate));
      
      const stats: FilteredStats = {
        total_reviews: reviews.length,
        filtered_count: reviewScores.filter(r => r.should_filter).length,
        filtered_percentage: Math.round((reviewScores.filter(r => r.should_filter).length / reviews.length) * 100),
        original_rating: originalRating,
        filtered_rating: filteredRating,
        rating_difference: Math.round((filteredRating - originalRating) * 100) / 100,
        by_reason: reasonCount
      };
      
      // Display results
      this.displayResults(reviewScores, stats);
      
      return stats;
      
    } finally {
      client.release();
    }
  }
  
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const validNumbers = numbers.filter(n => n != null);
    if (validNumbers.length === 0) return 0;
    const sum = validNumbers.reduce((a, b) => a + b, 0);
    return Math.round((sum / validNumbers.length) * 10) / 10;
  }
  
  private async saveTrustScore(reviewId: number, trustScore: number, isFake: boolean, shouldFilter: boolean): Promise<void> {
    const client = await this.pgPool.connect();
    
    try {
      // Create table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS review_trust_scores (
          id SERIAL PRIMARY KEY,
          review_id INTEGER REFERENCES validated_items(id),
          trust_score INTEGER,
          is_fake BOOLEAN,
          should_filter BOOLEAN,
          calculated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(review_id)
        )
      `);
      
      // Save score
      await client.query(`
        INSERT INTO review_trust_scores (review_id, trust_score, is_fake, should_filter)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (review_id) DO UPDATE SET
          trust_score = EXCLUDED.trust_score,
          is_fake = EXCLUDED.is_fake,
          should_filter = EXCLUDED.should_filter,
          calculated_at = NOW()
      `, [reviewId, trustScore, isFake, shouldFilter]);
      
    } finally {
      client.release();
    }
  }
  
  private displayResults(reviews: ReviewScore[], stats: FilteredStats): void {
    console.log('\n📊 KẾT QUẢ LỌC REVIEW:');
    console.log('='.repeat(50));
    
    console.log(`\n📈 Thống kê:`);
    console.log(`  Tổng số review: ${stats.total_reviews}`);
    console.log(`  Số review bị lọc: ${stats.filtered_count} (${stats.filtered_percentage}%)`);
    console.log(`  Rating gốc: ⭐ ${stats.original_rating}`);
    console.log(`  Rating sau lọc: ⭐ ${stats.filtered_rating}`);
    console.log(`  Chênh lệch: ${stats.rating_difference > 0 ? '+' : ''}${stats.rating_difference}`);
    
    if (Object.keys(stats.by_reason).length > 0) {
      console.log(`\n⚠️ Lý do lọc:`);
      Object.entries(stats.by_reason)
        .sort((a, b) => b[1] - a[1])
        .forEach(([reason, count]) => {
          console.log(`  • ${reason}: ${count} lần`);
        });
    }
    
    // Show fake reviews
    const fakeReviews = reviews.filter(r => r.is_fake).slice(0, 5);
    if (fakeReviews.length > 0) {
      console.log(`\n🚫 Top review FAKE (trust score < ${this.fakeThreshold}):`);
      fakeReviews.forEach((r, i) => {
        console.log(`\n  ${i+1}. ${r.username} - ${r.star_rate} sao (Trust: ${r.trust_score})`);
        console.log(`     "${r.comment ? r.comment.substring(0, 80) + '...' : '[Không có comment]'}"`);
        if (r.suspicious_reasons.length > 0) {
          console.log(`     Lý do: ${r.suspicious_reasons.join(', ')}`);
        }
      });
    }
    
    // Show suspicious but not fake
    const suspiciousReviews = reviews
      .filter(r => r.should_filter && !r.is_fake)
      .slice(0, 3);
    
    if (suspiciousReviews.length > 0) {
      console.log(`\n⚠️ Review đáng ngờ (trust score ${this.fakeThreshold}-${this.suspiciousThreshold}):`);
      suspiciousReviews.forEach((r, i) => {
        console.log(`\n  ${i+1}. ${r.username} - ${r.star_rate} sao (Trust: ${r.trust_score})`);
        console.log(`     "${r.comment ? r.comment.substring(0, 80) + '...' : '[Không có comment]'}"`);
      });
    }
    
    // Distribution of trust scores
    const distribution = {
      excellent: reviews.filter(r => r.trust_score >= 80).length,
      good: reviews.filter(r => r.trust_score >= 60 && r.trust_score < 80).length,
      suspicious: reviews.filter(r => r.trust_score >= 30 && r.trust_score < 60).length,
      fake: reviews.filter(r => r.trust_score < 30).length
    };
    
    console.log(`\n📊 Phân bố Trust Score:`);
    console.log(`  Excellent (80-100): ${distribution.excellent} reviews`);
    console.log(`  Good (60-79): ${distribution.good} reviews`);
    console.log(`  Suspicious (30-59): ${distribution.suspicious} reviews`);
    console.log(`  Fake (0-29): ${distribution.fake} reviews`);
  }
  
  async getFilteredReviews(productId?: string, minTrustScore: number = 60): Promise<any[]> {
    const client = await this.pgPool.connect();
    
    try {
      let query = `
        SELECT 
          vi.*,
          rts.trust_score,
          rts.is_fake,
          rts.should_filter
        FROM validated_items vi
        JOIN review_trust_scores rts ON vi.id = rts.review_id
        WHERE vi.item_type = 'review'
          AND rts.trust_score >= $1
      `;
      
      const params: any[] = [minTrustScore];
      
      if (productId) {
        query += ' AND vi.product_id = $2';
        params.push(productId);
      }
      
      query += ' ORDER BY rts.trust_score DESC, vi.created_at DESC';
      
      const result = await client.query(query, params);
      return result.rows;
      
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
  const filter = new ReviewFilter();
  
  async function run() {
    const command = process.argv[2] || 'filter';
    const productId = process.argv[3];
    
    try {
      switch (command) {
        case 'filter':
          await filter.processReviews(productId);
          break;
          
        case 'trusted':
          const minScore = parseInt(process.argv[3] || '60');
          const trustedReviews = await filter.getFilteredReviews(undefined, minScore);
          console.log(`\n✅ ${trustedReviews.length} review đáng tin (trust score >= ${minScore})`);
          
          trustedReviews.slice(0, 5).forEach((r, i) => {
            console.log(`\n${i+1}. ${r.username} - ${r.star_rate} sao (Trust: ${r.trust_score})`);
            console.log(`   "${r.comment ? r.comment.substring(0, 100) + '...' : '[No comment]'}"`);
          });
          break;
          
        default:
          console.log('Usage: tsx review-filter.ts [filter|trusted] [productId|minScore]');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      await filter.cleanup();
    }
  }
  
  run();
}