/**
 * Extension Adapter - Transform data from Chrome Extension to Core Validator format
 * This adapter handles data coming from the Rate Crawler Extension
 */

class ExtensionAdapter {
  /**
   * Transform raw data from extension to Core Validator format
   * @param {Object} rawData - Data from extension (checkscam.com format)
   * @param {Object} metadata - Additional metadata from extension
   * @returns {Object} Transformed data ready for Core Validator
   */
  static transform(rawData, metadata = {}) {
    // Handle both single item and array
    const items = Array.isArray(rawData) ? rawData : [rawData];
    
    return items.map(item => this.transformSingle(item, metadata));
  }
  
  /**
   * Transform a single scammer entry
   */
  static transformSingle(item, metadata) {
    // Extension data format from checkscam.com:
    // {
    //   id: "scam-id", 
    //   owner: "NGUYEN VAN A (0912345678)",
    //   account: "1234567890",
    //   bank: "Vietcombank", 
    //   amount: "1,500,000 đ",
    //   category: "Game",
    //   content: "Lừa đảo bán acc game...",
    //   votes_up: "10",
    //   votes_down: "2",
    //   images: ["url1", "url2"]
    // }
    
    const transformed = {
      // Core fields
      owner: this.cleanOwner(item.owner),
      account: this.cleanAccount(item.account),
      bank: this.cleanBank(item.bank),
      amount: this.parseAmount(item.amount),
      content: this.cleanContent(item.content),
      category: item.category || 'Khác',
      
      // Optional fields
      phone: this.extractPhone(item.owner),
      images: Array.isArray(item.images) ? item.images : [],
      
      // Extension-specific fields
      votes: {
        up: parseInt(item.votes_up) || 0,
        down: parseInt(item.votes_down) || 0,
        total: (parseInt(item.votes_up) || 0) + (parseInt(item.votes_down) || 0)
      },
      
      // Metadata
      _meta: {
        source: 'browser_extension',
        source_id: item.id,
        source_url: metadata.url || 'https://checkscam.com',
        crawled_at: metadata.timestamp || new Date().toISOString(),
        extension_version: metadata.version || '1.0.0',
        crawl_mode: metadata.mode || 'normal', // normal or stealth
        ...metadata
      }
    };
    
    // Add calculated fields
    transformed._meta.trust_score = this.calculateTrustScore(transformed);
    
    return transformed;
  }
  
  /**
   * Clean owner name - remove extra spaces, normalize case
   */
  static cleanOwner(owner) {
    if (!owner) return '';
    
    // Remove phone number from owner name (will extract separately)
    let cleaned = owner.replace(/\([^)]*\)/g, '').trim();
    
    // Remove special characters but keep Vietnamese
    cleaned = cleaned.replace(/[^\w\s\u00C0-\u1EF9]/g, ' ');
    
    // Normalize spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Convert to uppercase as per business requirement
    return cleaned.toUpperCase();
  }
  
  /**
   * Clean account number - remove spaces, validate format
   */
  static cleanAccount(account) {
    if (!account) return '';
    
    // Remove all non-digits
    const cleaned = account.replace(/\D/g, '');
    
    // Validate length (9-19 digits)
    if (cleaned.length < 9 || cleaned.length > 19) {
      console.warn(`Invalid account length: ${cleaned.length} digits`);
    }
    
    return cleaned;
  }
  
  /**
   * Clean and normalize bank name
   */
  static cleanBank(bank) {
    if (!bank) return '';
    
    // Remove extra spaces and trim
    let cleaned = bank.replace(/\s+/g, ' ').trim();
    
    // Map common variations (will be further normalized by Core Validator)
    const quickMap = {
      'VCB': 'Vietcombank',
      'MB': 'MB Bank',
      'TCB': 'Techcombank',
      'ACB': 'ACB'
    };
    
    return quickMap[cleaned.toUpperCase()] || cleaned;
  }
  
  /**
   * Parse amount from text to number
   */
  static parseAmount(amount) {
    if (!amount) return 0;
    
    // Remove currency symbols and text
    let cleaned = amount.toString()
      .replace(/[đ$,.\s]/g, '')
      .replace(/VND|VNĐ|đồng/gi, '');
    
    // Handle dot as thousand separator
    cleaned = cleaned.replace(/\./g, '');
    
    // Parse to number
    const parsed = parseInt(cleaned);
    
    return isNaN(parsed) ? 0 : parsed;
  }
  
  /**
   * Clean content - decode HTML entities, remove scripts
   */
  static cleanContent(content) {
    if (!content) return '';
    
    // Decode HTML entities
    let cleaned = content
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    // Remove any script tags (safety)
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }
  
  /**
   * Extract phone number from owner field
   */
  static extractPhone(owner) {
    if (!owner) return '';
    
    // Look for phone in parentheses first
    const parenMatch = owner.match(/\(([0-9\s]+)\)/);
    if (parenMatch) {
      const phone = parenMatch[1].replace(/\s/g, '');
      if (phone.match(/^(0|84)\d{9,10}$/)) {
        return phone;
      }
    }
    
    // Look for phone in general text
    const phoneMatch = owner.match(/(0|84)\d{9,10}/);
    return phoneMatch ? phoneMatch[0] : '';
  }
  
  /**
   * Calculate trust score based on votes and content
   */
  static calculateTrustScore(data) {
    let score = 0.5; // Base score
    
    // Factor 1: Votes
    if (data.votes.total > 0) {
      const voteRatio = data.votes.up / data.votes.total;
      score = score * 0.7 + voteRatio * 0.3;
    }
    
    // Factor 2: Data completeness
    const fields = ['owner', 'account', 'bank', 'amount', 'content'];
    const filledFields = fields.filter(f => data[f]).length;
    const completeness = filledFields / fields.length;
    score = score * 0.8 + completeness * 0.2;
    
    // Factor 3: Content quality
    if (data.content && data.content.length > 50) {
      score += 0.1;
    }
    
    // Factor 4: Has evidence (images)
    if (data.images && data.images.length > 0) {
      score += 0.1;
    }
    
    return Math.min(Math.max(score, 0), 1);
  }
  
  /**
   * Batch transform with progress callback
   */
  static async transformBatch(items, metadata = {}, onProgress = null) {
    const results = [];
    const total = items.length;
    
    for (let i = 0; i < total; i++) {
      try {
        const transformed = this.transformSingle(items[i], metadata);
        results.push({
          success: true,
          data: transformed,
          original: items[i]
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          original: items[i]
        });
      }
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          percentage: Math.round(((i + 1) / total) * 100)
        });
      }
    }
    
    return {
      results: results,
      summary: {
        total: total,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExtensionAdapter;
} else if (typeof self !== 'undefined') {
  // Browser/Service Worker environment
  self.ExtensionAdapter = ExtensionAdapter;
}
