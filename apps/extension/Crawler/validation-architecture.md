# Rate Platform - Data Validation Architecture

## Overview
Multi-source data validation system với 2 layers: Source Adapters + Core Validator

## Architecture

### 1. Source Adapters (Specific cho mỗi nguồn)

#### Web Scraper Adapter
```javascript
class WebScraperAdapter {
  // Xử lý đặc thù của web scraping
  static transform(rawData) {
    return {
      // Parse HTML entities
      owner: this.decodeHTML(rawData.owner),
      // Fix encoding issues
      content: this.fixEncoding(rawData.content),
      // Parse amount từ nhiều format
      amount: this.parseWebAmount(rawData.amount),
      // Extract từ text patterns
      bank: this.extractBankFromText(rawData.bank),
      // Metadata
      source: 'web_scraper',
      source_url: rawData.url,
      crawled_at: rawData.timestamp
    };
  }
}
```

#### Browser Extension Adapter
```javascript
class BrowserExtensionAdapter {
  // Xử lý data từ extension
  static transform(rawData) {
    return {
      // Already cleaned by extension
      owner: rawData.owner,
      account: rawData.account,
      // Handle dynamic content
      content: this.cleanDynamicContent(rawData.content),
      // Images từ extension
      images: this.processImages(rawData.images),
      // Metadata
      source: 'browser_extension',
      user_agent: rawData.userAgent,
      session_id: rawData.sessionId
    };
  }
}
```

#### User Input Adapter
```javascript
class UserInputAdapter {
  // Xử lý input từ user
  static async transform(formData) {
    return {
      // Trim whitespace
      owner: formData.owner?.trim(),
      // Validate realtime
      account: await this.validateAccountRealtime(formData.account),
      // Auto-complete bank
      bank: this.autoCompleteBank(formData.bank),
      // Parse user-friendly amount
      amount: this.parseUserAmount(formData.amount),
      // Metadata
      source: 'user_input',
      user_id: formData.userId,
      ip_address: formData.ip,
      submitted_at: new Date()
    };
  }
}
```

### 2. Core Validator (Chung cho mọi nguồn)

```javascript
class CoreValidator {
  // Business rules áp dụng cho TẤT CẢ data
  static async validate(data) {
    const errors = [];
    const warnings = [];
    
    // 1. Required fields
    if (!data.owner) errors.push('MISSING_OWNER');
    if (!data.account) errors.push('MISSING_ACCOUNT');
    
    // 2. Format validation
    if (!this.isValidAccountFormat(data.account)) {
      errors.push('INVALID_ACCOUNT_FORMAT');
    }
    
    // 3. Bank validation
    data.bank = this.normalizeBank(data.bank);
    if (!this.isKnownBank(data.bank)) {
      warnings.push('UNKNOWN_BANK');
    }
    
    // 4. Amount validation
    if (data.amount < 0) errors.push('NEGATIVE_AMOUNT');
    if (data.amount > 1000000000) warnings.push('SUSPICIOUS_AMOUNT');
    
    // 5. Duplicate check
    const isDuplicate = await this.checkDuplicate(data);
    if (isDuplicate) warnings.push('POSSIBLE_DUPLICATE');
    
    // 6. Fraud patterns
    const fraudScore = await this.calculateFraudScore(data);
    if (fraudScore > 0.8) warnings.push('HIGH_FRAUD_RISK');
    
    // 7. Data enrichment
    data = await this.enrichData(data);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      data,
      fraudScore
    };
  }
  
  // Shared business logic
  static normalizeBank(bank) {
    const bankMap = {
      'vcb': 'Vietcombank',
      'mb': 'MB Bank',
      'tcb': 'Techcombank',
      // ... more mappings
    };
    return bankMap[bank.toLowerCase()] || bank;
  }
  
  static async enrichData(data) {
    // Extract phone from owner
    const phoneMatch = data.owner.match(/\d{10,11}/);
    if (phoneMatch) {
      data.phone = phoneMatch[0];
    }
    
    // Geocoding từ bank/phone
    data.region = await this.detectRegion(data);
    
    // Category detection từ content
    data.category = await this.detectCategory(data.content);
    
    return data;
  }
}
```

### 3. Integration Flow

```javascript
class ScamReportProcessor {
  static async process(rawData, source) {
    try {
      // 1. Source-specific transformation
      let transformedData;
      switch(source) {
        case 'web_scraper':
          transformedData = WebScraperAdapter.transform(rawData);
          break;
        case 'browser_extension':
          transformedData = BrowserExtensionAdapter.transform(rawData);
          break;
        case 'user_input':
          transformedData = await UserInputAdapter.transform(rawData);
          break;
        default:
          throw new Error('Unknown source');
      }
      
      // 2. Core validation
      const validation = await CoreValidator.validate(transformedData);
      
      // 3. Handle results
      if (validation.isValid) {
        // Save to database
        await this.saveToStrapi(validation.data);
        
        // Queue for additional processing
        if (validation.warnings.includes('HIGH_FRAUD_RISK')) {
          await this.queueForManualReview(validation.data);
        }
      } else {
        // Log errors
        await this.logValidationError(rawData, validation.errors);
      }
      
      return validation;
      
    } catch (error) {
      console.error('Processing error:', error);
      throw error;
    }
  }
}
```

## Benefits

1. **Separation of Concerns**
   - Source adapters handle source-specific quirks
   - Core validator enforces business rules

2. **Maintainability**
   - Easy to add new sources
   - Business rules in one place

3. **Testability**
   - Test adapters với source-specific data
   - Test core validator với normalized data

4. **Scalability**
   - Can process different sources in parallel
   - Easy to add new validation rules

5. **Flexibility**
   - Different UI/UX per source
   - Same data quality standards

## Implementation Steps

1. **Phase 1**: Build Core Validator
   - Define data schema
   - Implement business rules
   - Setup duplicate detection

2. **Phase 2**: Create Adapters
   - Web scraper adapter (for checkscam.com)
   - Browser extension adapter
   - User input adapter

3. **Phase 3**: Integration
   - API endpoints
   - Queue system
   - Error handling

4. **Phase 4**: Enhancement
   - Machine learning fraud detection
   - Real-time validation
   - Analytics dashboard
