// Data validation and cleaning module

class DataValidator {
  // Clean and validate scammer data
  static validateScammer(data) {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!data.owner || data.owner.trim() === '') {
      errors.push('Missing owner name');
    }
    
    if (!data.account || data.account.trim() === '') {
      errors.push('Missing account number');
    }
    
    if (!data.bank || data.bank.trim() === '') {
      errors.push('Missing bank name');
    }
    
    // Clean data
    const cleaned = {
      id: data.id || '',
      owner: this.cleanOwnerName(data.owner || ''),
      account: this.cleanAccountNumber(data.account || ''),
      bank: this.normalizeBank(data.bank || ''),
      amount: this.parseAmount(data.amount || ''),
      amountText: data.amount || '0',
      category: data.category || 'Khác',
      content: this.cleanContent(data.content || ''),
      votes_up: parseInt(data.votes_up || '0'),
      votes_down: parseInt(data.votes_down || '0'),
      images: data.images || [],
      source: 'checkscam.com',
      crawled_at: new Date().toISOString()
    };
    
    // Extract phone from owner if exists
    const phoneMatch = cleaned.owner.match(/\((\d{10,11})\)/);
    if (phoneMatch) {
      cleaned.phone = phoneMatch[1];
      cleaned.owner = cleaned.owner.replace(/\s*\(\d{10,11}\)\s*/, '').trim();
    }
    
    // Validate account number format
    if (cleaned.account && !this.isValidAccount(cleaned.account)) {
      warnings.push(`Suspicious account number: ${cleaned.account}`);
    }
    
    // Check amount
    if (cleaned.amount === 0) {
      warnings.push('Amount is 0 or invalid');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data: cleaned
    };
  }
  
  // Clean owner name
  static cleanOwnerName(name) {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF()]/g, '') // Keep Vietnamese chars
      .toUpperCase();
  }
  
  // Clean account number
  static cleanAccountNumber(account) {
    return account
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^\d]/g, ''); // Only digits
  }
  
  // Normalize bank names
  static normalizeBank(bank) {
    const bankMap = {
      'vietcombank': 'Vietcombank',
      'vcb': 'Vietcombank',
      'techcombank': 'Techcombank',
      'tcb': 'Techcombank',
      'mb bank': 'MB Bank',
      'mb': 'MB Bank',
      'mbbank': 'MB Bank',
      'vietinbank': 'VietinBank',
      'agribank': 'Agribank',
      'bidv': 'BIDV',
      'acb': 'ACB',
      'sacombank': 'Sacombank',
      'tpbank': 'TPBank',
      'vpbank': 'VPBank',
      'shb': 'SHB',
      'vib': 'VIB',
      'hdbank': 'HDBank',
      'ocb': 'OCB',
      'seabank': 'SeABank',
      'á châu': 'ACB',
      'ngân hàng á châu': 'ACB'
    };
    
    const normalized = bank.toLowerCase().trim();
    return bankMap[normalized] || bank.trim();
  }
  
  // Parse amount to number
  static parseAmount(amountStr) {
    if (!amountStr) return 0;
    
    // Remove currency symbol and spaces
    const cleaned = amountStr
      .replace(/[^\d,]/g, '')
      .replace(/,/g, '');
    
    return parseInt(cleaned) || 0;
  }
  
  // Clean content
  static cleanContent(content) {
    return content
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  
  // Validate account number format
  static isValidAccount(account) {
    // Most VN bank accounts are 9-19 digits
    return /^\d{9,19}$/.test(account);
  }
  
  // Process batch of scammers
  static processBatch(scammers) {
    const results = {
      valid: [],
      invalid: [],
      warnings: [],
      stats: {
        total: scammers.length,
        valid: 0,
        invalid: 0,
        warnings: 0,
        totalAmount: 0,
        byBank: {},
        byCategory: {}
      }
    };
    
    scammers.forEach(scammer => {
      const validation = this.validateScammer(scammer);
      
      if (validation.isValid) {
        results.valid.push(validation.data);
        results.stats.valid++;
        
        // Update stats
        results.stats.totalAmount += validation.data.amount;
        
        const bank = validation.data.bank;
        results.stats.byBank[bank] = (results.stats.byBank[bank] || 0) + 1;
        
        const category = validation.data.category;
        results.stats.byCategory[category] = (results.stats.byCategory[category] || 0) + 1;
      } else {
        results.invalid.push({
          original: scammer,
          errors: validation.errors
        });
        results.stats.invalid++;
      }
      
      if (validation.warnings.length > 0) {
        results.warnings.push({
          data: validation.data,
          warnings: validation.warnings
        });
        results.stats.warnings++;
      }
    });
    
    return results;
  }
  
  // Remove duplicates by account number
  static removeDuplicates(scammers) {
    const seen = new Map();
    const duplicates = [];
    
    scammers.forEach(scammer => {
      const key = `${scammer.account}-${scammer.bank}`;
      if (seen.has(key)) {
        duplicates.push({
          kept: seen.get(key),
          duplicate: scammer
        });
      } else {
        seen.set(key, scammer);
      }
    });
    
    return {
      unique: Array.from(seen.values()),
      duplicates
    };
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataValidator;
}
