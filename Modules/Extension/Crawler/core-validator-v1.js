/**
 * Core Validator v1 - Foundation for all data validation
 * This defines the common data structure and validation rules
 */

// Common data schema that ALL adapters must transform to
const ScammerSchema = {
  // Required fields
  owner: { type: 'string', required: true, minLength: 2 },
  account: { type: 'string', required: true, pattern: /^\d{9,19}$/ },
  bank: { type: 'string', required: true, minLength: 2 },
  
  // Optional fields with defaults
  amount: { type: 'number', default: 0, min: 0 },
  content: { type: 'string', default: '' },
  category: { type: 'string', default: 'Khác' },
  phone: { type: 'string', pattern: /^(0|84)\d{9,10}$/ },
  images: { type: 'array', default: [] },
  
  // Metadata (auto-added)
  _meta: {
    source: { type: 'string', required: true },
    crawled_at: { type: 'date', default: () => new Date() },
    validated_at: { type: 'date' },
    fraud_score: { type: 'number', min: 0, max: 1 }
  }
};

// Bank name normalization map
const BANK_MAP = {
  // Vietcombank variants
  'vcb': 'Vietcombank',
  'vietcombank': 'Vietcombank',
  'ngoại thương': 'Vietcombank',
  
  // MB Bank variants
  'mb': 'MB Bank',
  'mbbank': 'MB Bank',
  'mb bank': 'MB Bank',
  'quân đội': 'MB Bank',
  
  // Techcombank variants
  'tcb': 'Techcombank',
  'techcombank': 'Techcombank',
  'kỹ thương': 'Techcombank',
  
  // ACB variants
  'acb': 'ACB',
  'á châu': 'ACB',
  
  // Add more as needed...
};

// Category detection keywords
const CATEGORY_KEYWORDS = {
  'Game': ['game', 'acc game', 'tài khoản game', 'nạp game'],
  'Đầu tư': ['đầu tư', 'forex', 'chứng khoán', 'coin', 'tiền ảo'],
  'Vay tiền': ['vay', 'cho vay', 'tín dụng', 'khoản vay'],
  'Bán hàng': ['bán hàng', 'shop', 'order', 'đặt hàng'],
  'Tình cảm': ['tình cảm', 'quen qua mạng', 'hẹn hò'],
  'Việc làm': ['việc làm', 'tuyển dụng', 'cộng tác viên'],
};

class CoreValidator {
  constructor(options = {}) {
    this.options = {
      strictMode: false,
      enableFraudDetection: true,
      enableEnrichment: true,
      ...options
    };
  }

  /**
   * Main validation method - all data must pass through this
   */
  async validate(data, source) {
    const startTime = Date.now();
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      data: null,
      metadata: {}
    };

    try {
      // Step 1: Schema validation
      const schemaResult = this.validateSchema(data);
      if (!schemaResult.isValid) {
        result.isValid = false;
        result.errors.push(...schemaResult.errors);
        if (this.options.strictMode) {
          return result;
        }
      }

      // Step 2: Clean and normalize
      const cleanedData = this.cleanData(data);
      
      // Step 3: Business rules validation
      const businessResult = this.validateBusinessRules(cleanedData);
      result.warnings.push(...businessResult.warnings);
      
      // Step 4: Enrichment (if enabled)
      let enrichedData = cleanedData;
      if (this.options.enableEnrichment) {
        enrichedData = await this.enrichData(cleanedData);
      }
      
      // Step 5: Fraud detection (if enabled)
      if (this.options.enableFraudDetection) {
        const fraudScore = await this.calculateFraudScore(enrichedData);
        enrichedData.fraudScore = fraudScore; // Add to root level
        enrichedData._meta.fraud_score = fraudScore;
        if (fraudScore > 0.7) {
          result.warnings.push(`High fraud risk detected: ${fraudScore}`);
        }
      }
      
      // Step 6: Add metadata
      enrichedData._meta = {
        ...enrichedData._meta,
        source,
        validated_at: new Date(),
        validation_version: '1.0'
      };
      
      result.data = enrichedData;
      result.metadata = {
        processingTime: Date.now() - startTime,
        enrichmentsApplied: this.getAppliedEnrichments(data, enrichedData)
      };
      
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }
    
    return result;
  }

  /**
   * Schema validation against defined structure
   */
  validateSchema(data) {
    const errors = [];
    
    // Check required fields
    ['owner', 'account', 'bank'].forEach(field => {
      if (!data[field] || data[field].toString().trim() === '') {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    // Validate account format
    if (data.account && !/^\d{9,19}$/.test(data.account.toString().trim())) {
      errors.push('Invalid account format (must be 9-19 digits)');
    }
    
    // Validate amount if present
    if (data.amount !== undefined && data.amount !== null) {
      const amount = parseFloat(data.amount);
      if (isNaN(amount) || amount < 0) {
        errors.push('Invalid amount (must be non-negative number)');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Clean and normalize data
   */
  cleanData(data) {
    return {
      owner: this.cleanText(data.owner).toUpperCase(),
      account: this.cleanText(data.account),
      bank: this.normalizeBank(data.bank),
      amount: this.parseAmount(data.amount),
      content: this.cleanText(data.content || ''),
      category: data.category || 'Khác',
      phone: this.extractPhone(data.phone || data.owner || ''),
      images: Array.isArray(data.images) ? data.images : [],
      _meta: data._meta || {}
    };
  }

  /**
   * Business rules validation
   */
  validateBusinessRules(data) {
    const warnings = [];
    
    // Check suspicious patterns
    if (data.account.length < 9) {
      warnings.push('Account number seems too short');
    }
    
    if (data.amount > 1000000000) { // 1 billion
      warnings.push('Unusually high amount');
    }
    
    if (data.amount === 0) {
      warnings.push('Amount is zero');
    }
    
    // Check if bank is recognized
    if (!Object.values(BANK_MAP).includes(data.bank) && data.bank !== this.normalizeBank(data.bank)) {
      warnings.push(`Unknown bank: ${data.bank}`);
    }
    
    return { warnings };
  }

  /**
   * Enrich data with additional information
   */
  async enrichData(data) {
    const enriched = { ...data };
    
    // Extract phone from owner if not present
    if (!enriched.phone && enriched.owner) {
      const phoneMatch = enriched.owner.match(/\d{10,11}/);
      if (phoneMatch) {
        enriched.phone = this.normalizePhone(phoneMatch[0]);
      }
    }
    
    // Auto-detect category from content
    if (enriched.category === 'Khác' && enriched.content) {
      enriched.category = this.detectCategory(enriched.content);
    }
    
    // Add region based on bank/phone
    enriched._meta.region = this.detectRegion(enriched);
    
    return enriched;
  }

  /**
   * Calculate fraud score based on patterns
   */
  async calculateFraudScore(data) {
    let score = 0;
    const factors = [];
    
    // Factor 1: Repeated account across different owners
    // (In real implementation, this would check database)
    if (await this.isRepeatedAccount(data.account)) {
      score += 0.3;
      factors.push('repeated_account');
    }
    
    // Factor 2: Suspicious content patterns
    const suspiciousKeywords = ['khẩn cấp', 'gấp', 'nhanh', 'uy tín 100%'];
    const contentLower = data.content.toLowerCase();
    if (suspiciousKeywords.some(keyword => contentLower.includes(keyword))) {
      score += 0.2;
      factors.push('suspicious_keywords');
    }
    
    // Factor 3: High amount with new account
    if (data.amount > 10000000) { // 10 million
      score += 0.2;
      factors.push('high_amount');
    }
    
    // Factor 4: Multiple reports in short time
    // (Would check timestamp patterns in real implementation)
    
    data._meta.fraud_factors = factors;
    return Math.min(score, 1);
  }

  /**
   * Batch validation with progress callback
   * @param {Array} items - Array of items to validate
   * @param {Function} onProgress - Progress callback
   * @returns {Object} Batch validation results
   */
  async validateBatch(items, onProgress = null) {
    const results = [];
    const total = items.length;
    const duplicateTracker = new Map();
    
    for (let i = 0; i < total; i++) {
      try {
        const validationResult = await this.validate(items[i], items[i]._meta?.source || 'unknown');
        
        // Check for duplicates
        const key = `${validationResult.data.owner}-${validationResult.data.account}-${validationResult.data.bank}`;
        if (duplicateTracker.has(key)) {
          validationResult.warnings.push('Duplicate entry detected');
          validationResult.isDuplicate = true;
        } else {
          duplicateTracker.set(key, i);
        }
        
        results.push(validationResult);
      } catch (error) {
        results.push({
          isValid: false,
          errors: [`Validation error: ${error.message}`],
          warnings: [],
          data: items[i],
          metadata: {}
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
    
    // Calculate summary
    const summary = {
      total: total,
      valid: results.filter(r => r.isValid).length,
      invalid: results.filter(r => !r.isValid).length,
      totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
      duplicatesFound: results.filter(r => r.isDuplicate).length
    };
    
    return {
      results: results,
      summary: summary
    };
  }

  // Utility methods
  cleanText(text) {
    if (!text) return '';
    return text.toString()
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ');
  }

  normalizeBank(bank) {
    if (!bank) return '';
    const cleaned = bank.toString().toLowerCase().trim();
    return BANK_MAP[cleaned] || bank.toString().trim();
  }

  parseAmount(amount) {
    if (!amount) return 0;
    const cleaned = amount.toString()
      .replace(/[^\d.,]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return parseFloat(cleaned) || 0;
  }

  extractPhone(text) {
    const match = text.match(/(0|84)\d{9,10}/);
    return match ? this.normalizePhone(match[0]) : '';
  }

  normalizePhone(phone) {
    if (phone.startsWith('84')) {
      return '0' + phone.substring(2);
    }
    return phone;
  }

  detectCategory(content) {
    const contentLower = content.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        return category;
      }
    }
    return 'Khác';
  }

  detectRegion(data) {
    // Simple region detection based on phone prefix
    if (data.phone) {
      if (data.phone.startsWith('09') || data.phone.startsWith('03')) {
        return 'Miền Nam';
      } else if (data.phone.startsWith('07') || data.phone.startsWith('08')) {
        return 'Miền Trung';
      }
    }
    return 'Không xác định';
  }

  async isRepeatedAccount(account) {
    // In real implementation, check database
    // For now, return false
    return false;
  }

  getAppliedEnrichments(original, enriched) {
    const enrichments = [];
    if (!original.phone && enriched.phone) {
      enrichments.push('phone_extracted');
    }
    if (original.category === 'Khác' && enriched.category !== 'Khác') {
      enrichments.push('category_detected');
    }
    if (enriched._meta.region) {
      enrichments.push('region_detected');
    }
    return enrichments;
  }
}

// Export for use in adapters
const coreValidator = new CoreValidator();

// Support both CommonJS and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CoreValidator,
    ScammerSchema,
    coreValidator,
    // Export static methods for convenience
    validate: (data, source) => coreValidator.validate(data, source),
    validateBatch: (items, onProgress) => coreValidator.validateBatch(items, onProgress)
  };
} else if (typeof self !== 'undefined') {
  // Browser/Service Worker environment
  self.CoreValidator = coreValidator;
  self.CoreValidatorClass = CoreValidator;
  self.ScammerSchema = ScammerSchema;
}
