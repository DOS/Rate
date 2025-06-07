/**
 * Extension Adapter ES Module Version
 * For use in browser with import/export syntax
 */

export class ExtensionAdapter {
  /**
   * Transform raw data from extension to Core Validator format
   * @param {Object} rawData - Data from extension (checkscam.com format)
   * @param {Object} metadata - Additional metadata from extension
   * @returns {Object} Transformed data ready for Core Validator
   */
  transform(rawData, metadata = {}) {
    // Clean and normalize data
    const cleaned = this.cleanData(rawData);
    
    // Extract phone if present in owner field
    const phoneData = this.extractPhoneFromOwner(cleaned.owner);
    
    // Calculate trust score based on votes and data quality
    const trustScore = this.calculateTrustScore(rawData);
    
    // Transform to Core Validator format
    return {
      // Required fields
      owner: phoneData.cleanedOwner || cleaned.owner || '',
      account: cleaned.account || '',
      bank: this.normalizeBank(cleaned.bank || ''),
      amount: this.parseAmount(cleaned.amount || 0),
      
      // Optional fields
      content: cleaned.content || '',
      category: cleaned.category || 'Khác',
      phone: phoneData.phone || cleaned.phone || '',
      images: Array.isArray(rawData.images) ? rawData.images : [],
      
      // Metadata
      _meta: {
        source: 'browser_extension',
        crawled_at: new Date().toISOString(),
        url: metadata.url || '',
        trust_score: trustScore,
        votes: parseInt(rawData.votes) || 0,
        ...metadata
      }
    };
  }
  
  /**
   * Transform batch of items with progress callback
   * @param {Array} items - Array of raw data items
   * @param {Function} onProgress - Progress callback function
   * @returns {Object} Results with success and failed arrays
   */
  async transformBatch(items, onProgress = null) {
    const results = {
      success: [],
      failed: []
    };
    
    const total = items.length;
    
    for (let i = 0; i < total; i++) {
      try {
        const transformed = this.transform(items[i]);
        results.success.push(transformed);
      } catch (error) {
        results.failed.push({
          item: items[i],
          error: error.message
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
    
    return results;
  }
  
  /**
   * Clean raw data from extension
   */
  cleanData(data) {
    return {
      owner: this.cleanText(data.owner),
      account: this.cleanAccount(data.account),
      bank: this.cleanText(data.bank),
      amount: this.cleanText(data.amount),
      content: this.cleanText(data.content),
      category: this.cleanText(data.category),
      phone: this.cleanText(data.phone),
      votes: parseInt(data.votes) || 0
    };
  }
  
  /**
   * Clean text - remove extra spaces, HTML tags
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .toString()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize spaces
      .trim();
  }
  
  /**
   * Clean account number - keep only digits
   */
  cleanAccount(account) {
    if (!account) return '';
    return account.toString().replace(/\D/g, '');
  }
  
  /**
   * Extract phone number from owner field
   * Many entries have format: "NAME - PHONE"
   */
  extractPhoneFromOwner(owner) {
    if (!owner) return { cleanedOwner: '', phone: '' };
    
    // Pattern: NAME - PHONE or NAME (PHONE)
    const patterns = [
      /^(.+?)\s*[-–]\s*(0\d{9,10})$/,  // NAME - 0xxxxxxxxx
      /^(.+?)\s*\((0\d{9,10})\)$/,     // NAME (0xxxxxxxxx)
      /^(.+?)\s+(0\d{9,10})$/           // NAME 0xxxxxxxxx
    ];
    
    for (const pattern of patterns) {
      const match = owner.match(pattern);
      if (match) {
        return {
          cleanedOwner: match[1].trim(),
          phone: match[2]
        };
      }
    }
    
    // Check if entire string is a phone number
    if (/^0\d{9,10}$/.test(owner.trim())) {
      return {
        cleanedOwner: '',
        phone: owner.trim()
      };
    }
    
    return { cleanedOwner: owner, phone: '' };
  }
  
  /**
   * Parse amount from various formats
   */
  parseAmount(amount) {
    if (!amount) return 0;
    
    // Convert to string and clean
    const amountStr = amount.toString()
      .replace(/[^\d,.-]/g, '') // Keep only digits, comma, dot, minus
      .replace(/,/g, '');       // Remove thousand separators
    
    const parsed = parseFloat(amountStr);
    return isNaN(parsed) ? 0 : Math.abs(parsed);
  }
  
  /**
   * Normalize bank names to standard format
   */
  normalizeBank(bank) {
    if (!bank) return 'Unknown';
    
    const bankMap = {
      'vcb': 'Vietcombank',
      'vietcombank': 'Vietcombank',
      'mb': 'MB Bank',
      'mbbank': 'MB Bank',
      'military': 'MB Bank',
      'acb': 'ACB',
      'tcb': 'Techcombank',
      'techcombank': 'Techcombank',
      'vib': 'VIB',
      'vpb': 'VPBank',
      'vpbank': 'VPBank',
      'bidv': 'BIDV',
      'agri': 'Agribank',
      'agribank': 'Agribank',
      'shb': 'SHB',
      'sacombank': 'Sacombank',
      'tpb': 'TPBank',
      'tpbank': 'TPBank'
    };
    
    const normalized = bank.toLowerCase().trim();
    
    // Check exact match first
    if (bankMap[normalized]) {
      return bankMap[normalized];
    }
    
    // Check partial match
    for (const [key, value] of Object.entries(bankMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    
    // Return original if no match
    return bank;
  }
  
  /**
   * Calculate trust score based on data quality and votes
   */
  calculateTrustScore(data) {
    let score = 0.5; // Base score
    
    // Votes impact (max +0.3)
    const votes = parseInt(data.votes) || 0;
    if (votes > 0) {
      score += Math.min(votes / 100, 0.3);
    }
    
    // Data completeness (max +0.2)
    const fields = ['owner', 'account', 'bank', 'amount', 'content'];
    const filledFields = fields.filter(f => data[f] && data[f].toString().trim()).length;
    score += (filledFields / fields.length) * 0.2;
    
    // Account validity
    const account = this.cleanAccount(data.account);
    if (account.length >= 9 && account.length <= 19) {
      score += 0.1;
    } else if (account.length > 0) {
      score -= 0.1;
      console.log(`Invalid account length: ${account.length} digits`);
    }
    
    // Amount validity
    const amount = this.parseAmount(data.amount);
    if (amount > 0) {
      score += 0.05;
    }
    
    // Has images
    if (data.images && data.images.length > 0) {
      score += 0.05;
    }
    
    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }
}
