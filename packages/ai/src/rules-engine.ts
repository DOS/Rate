/**
 * Rules Engine for Fast Pre-filtering
 * Handles quick pattern matching before expensive AI calls
 */

import {
  RuleCheckResult,
  ScamCategory,
  SpamCheckData,
  VietnameseContext
} from './types';

interface Rule {
  id: string;
  pattern?: RegExp;
  keywords?: string[];
  score: number;
  category?: ScamCategory;
  indicator: string;
}

interface RuleSet {
  phone: Rule[];
  keywords: {
    high_risk: { words: string[]; score: number };
    medium_risk: { words: string[]; score: number };
    low_risk: { words: string[]; score: number };
  };
  behavior: {
    spam_threshold: { calls_per_day: number; score: number };
    report_velocity: { reports_per_hour: number; score: number };
    time_patterns: {
      odd_hours: { start: number; end: number; score: number };
      weekend_only: { score: number };
    };
  };
  vietnamese: {
    scam_phrases: string[];
    authority_impersonation: string[];
    urgency_words: string[];
    banking_terms: string[];
  };
}

export class RulesEngine {
  private rules: RuleSet = {
    phone: [
      {
        id: 'premium_number',
        pattern: /^(1900|1800)/,
        score: 0.8,
        indicator: 'Premium/toll number detected',
        category: 'financial'
      },
      {
        id: 'sequential_digits',
        pattern: /(\d)\1{4,}/,
        score: 0.6,
        indicator: 'Sequential digits pattern',
        category: 'other'
      },
      {
        id: 'short_code',
        pattern: /^\d{4,5}$/,
        score: 0.5,
        indicator: 'Short code number',
        category: 'other'
      },
      {
        id: 'fake_international',
        pattern: /^\+84[0-9]{1,3}$/,
        score: 0.7,
        indicator: 'Suspicious international format',
        category: 'phishing'
      }
    ],
    
    keywords: {
      high_risk: {
        words: [
          // Vietnamese scam keywords
          'lừa đảo', 'scam', 'hack', 'chiếm đoạt', 'mất tiền',
          'ăn cắp', 'trộm cắp', 'giả mạo', 'mạo danh', 'lừa gạt',
          
          // English scam keywords  
          'fraud', 'stolen', 'hacked', 'phishing', 'malware',
          'ransomware', 'identity theft', 'ponzi', 'pyramid scheme'
        ],
        score: 0.9
      },
      
      medium_risk: {
        words: [
          // Vietnamese urgency/pressure
          'khẩn cấp', 'ngay lập tức', 'OTP', 'mã xác thực',
          'chuyển tiền', 'nạp tiền', 'rút tiền', 'thẻ ngân hàng',
          'tài khoản', 'mật khẩu', 'bảo mật', 'xác minh',
          
          // English urgency/pressure
          'urgent', 'immediate', 'act now', 'limited time',
          'verify account', 'suspend', 'confirm identity',
          'click here', 'update payment'
        ],
        score: 0.6
      },
      
      low_risk: {
        words: [
          // Vietnamese promotional
          'miễn phí', 'khuyến mãi', 'giảm giá', 'ưu đãi',
          'trúng thưởng', 'quà tặng', 'nhận ngay', 'cơ hội',
          
          // English promotional
          'free', 'discount', 'offer', 'prize', 'winner',
          'congratulations', 'selected', 'exclusive'
        ],
        score: 0.3
      }
    },
    
    behavior: {
      spam_threshold: { 
        calls_per_day: 10, 
        score: 0.7 
      },
      report_velocity: { 
        reports_per_hour: 5, 
        score: 0.8 
      },
      time_patterns: {
        odd_hours: { 
          start: 22, 
          end: 6, 
          score: 0.5 
        },
        weekend_only: { 
          score: 0.4 
        }
      }
    },
    
    vietnamese: {
      scam_phrases: [
        'công an gọi điện',
        'ngân hàng nhà nước',
        'bộ công an',
        'tòa án nhân dân',
        'viện kiểm sát',
        'cục thuế',
        'bảo hiểm xã hội',
        'trúng thưởng độc đắc',
        'tham gia chương trình',
        'làm việc tại nhà',
        'thu nhập cao',
        'không cần kinh nghiệm',
        'đầu tư sinh lời',
        'lãi suất cao'
      ],
      
      authority_impersonation: [
        'công an', 'cảnh sát', 'bộ công an',
        'ngân hàng nhà nước', 'ngân hàng trung ương',
        'tòa án', 'viện kiểm sát', 'thanh tra',
        'cục thuế', 'hải quan', 'bảo hiểm'
      ],
      
      urgency_words: [
        'khẩn cấp', 'gấp', 'ngay lập tức', 'cấp bách',
        'hết hạn', 'còn 24h', 'còn 48h', 'hôm nay',
        'bây giờ', 'ngay', 'lập tức', 'nhanh'
      ],
      
      banking_terms: [
        'OTP', 'mã OTP', 'mã xác thực', 'mã bảo mật',
        'số tài khoản', 'thẻ ATM', 'thẻ tín dụng',
        'chuyển khoản', 'chuyển tiền', 'thanh toán',
        'mật khẩu', 'PIN', 'CVV', 'internet banking'
      ]
    }
  };

  async check(data: {
    type: 'phone' | 'website' | 'review' | 'transaction';
    content: any;
    metadata?: any;
  }): Promise<RuleCheckResult> {
    const scores: number[] = [];
    const indicators: string[] = [];
    const matchedRules: string[] = [];
    let category: ScamCategory | undefined;

    // Check based on content type
    switch (data.type) {
      case 'phone':
        this.checkPhoneRules(data.content, scores, indicators, matchedRules);
        break;
      
      case 'review':
      case 'website':
      case 'transaction':
        this.checkTextRules(data.content.toString(), scores, indicators, matchedRules);
        break;
    }

    // Check metadata if available
    if (data.metadata) {
      this.checkBehaviorRules(data.metadata, scores, indicators, matchedRules);
    }

    // Check Vietnamese-specific patterns
    if (typeof data.content === 'string') {
      const vietnameseResults = this.checkVietnamesePatterns(data.content);
      scores.push(...vietnameseResults.scores);
      indicators.push(...vietnameseResults.indicators);
      matchedRules.push(...vietnameseResults.rules);
      if (vietnameseResults.category) {
        category = vietnameseResults.category;
      }
    }

    // Calculate final confidence score
    const confidence = this.calculateConfidence(scores);

    // Determine category if not set
    if (!category) {
      category = this.determineCategory(indicators, matchedRules);
    }

    return {
      confidence: Math.min(confidence, 1),
      indicators: [...new Set(indicators)], // Remove duplicates
      category,
      isScam: confidence > 0.6,
      matchedRules: [...new Set(matchedRules)]
    };
  }

  private checkPhoneRules(
    phone: string,
    scores: number[],
    indicators: string[],
    matchedRules: string[]
  ): void {
    for (const rule of this.rules.phone) {
      if (rule.pattern && rule.pattern.test(phone)) {
        scores.push(rule.score);
        indicators.push(rule.indicator);
        matchedRules.push(rule.id);
      }
    }
  }

  private checkTextRules(
    text: string,
    scores: number[],
    indicators: string[],
    matchedRules: string[]
  ): void {
    const lowerText = text.toLowerCase();

    // Check high risk keywords
    for (const keyword of this.rules.keywords.high_risk.words) {
      if (lowerText.includes(keyword.toLowerCase())) {
        scores.push(this.rules.keywords.high_risk.score);
        indicators.push(`High-risk keyword: ${keyword}`);
        matchedRules.push('high_risk_keyword');
      }
    }

    // Check medium risk keywords
    for (const keyword of this.rules.keywords.medium_risk.words) {
      if (lowerText.includes(keyword.toLowerCase())) {
        scores.push(this.rules.keywords.medium_risk.score);
        indicators.push(`Medium-risk keyword: ${keyword}`);
        matchedRules.push('medium_risk_keyword');
      }
    }

    // Check low risk keywords
    for (const keyword of this.rules.keywords.low_risk.words) {
      if (lowerText.includes(keyword.toLowerCase())) {
        scores.push(this.rules.keywords.low_risk.score);
        indicators.push(`Promotional keyword: ${keyword}`);
        matchedRules.push('low_risk_keyword');
      }
    }
  }

  private checkBehaviorRules(
    metadata: any,
    scores: number[],
    indicators: string[],
    matchedRules: string[]
  ): void {
    // Check call frequency
    if (metadata.callFrequency && 
        metadata.callFrequency > this.rules.behavior.spam_threshold.calls_per_day) {
      scores.push(this.rules.behavior.spam_threshold.score);
      indicators.push(`High call frequency: ${metadata.callFrequency} calls/day`);
      matchedRules.push('high_call_frequency');
    }

    // Check report velocity
    if (metadata.reportVelocity && 
        metadata.reportVelocity > this.rules.behavior.report_velocity.reports_per_hour) {
      scores.push(this.rules.behavior.report_velocity.score);
      indicators.push(`Rapid reporting: ${metadata.reportVelocity} reports/hour`);
      matchedRules.push('rapid_reporting');
    }

    // Check time patterns
    if (metadata.callTime) {
      const hour = new Date(metadata.callTime).getHours();
      const { odd_hours } = this.rules.behavior.time_patterns;
      
      if (hour >= odd_hours.start || hour < odd_hours.end) {
        scores.push(odd_hours.score);
        indicators.push(`Odd hour calling: ${hour}:00`);
        matchedRules.push('odd_hour_calling');
      }
    }
  }

  private checkVietnamesePatterns(text: string): {
    scores: number[];
    indicators: string[];
    rules: string[];
    category?: ScamCategory;
  } {
    const scores: number[] = [];
    const indicators: string[] = [];
    const rules: string[] = [];
    let category: ScamCategory | undefined;

    const lowerText = text.toLowerCase();

    // Check scam phrases
    for (const phrase of this.rules.vietnamese.scam_phrases) {
      if (lowerText.includes(phrase)) {
        scores.push(0.85);
        indicators.push(`Vietnamese scam phrase: "${phrase}"`);
        rules.push('vn_scam_phrase');
      }
    }

    // Check authority impersonation
    for (const authority of this.rules.vietnamese.authority_impersonation) {
      if (lowerText.includes(authority)) {
        scores.push(0.75);
        indicators.push(`Authority impersonation: "${authority}"`);
        rules.push('vn_authority_impersonation');
        category = 'phishing';
      }
    }

    // Check urgency words
    let urgencyCount = 0;
    for (const word of this.rules.vietnamese.urgency_words) {
      if (lowerText.includes(word)) {
        urgencyCount++;
      }
    }
    if (urgencyCount >= 2) {
      scores.push(0.6);
      indicators.push(`Multiple urgency words detected (${urgencyCount})`);
      rules.push('vn_urgency_pattern');
    }

    // Check banking terms
    let bankingCount = 0;
    for (const term of this.rules.vietnamese.banking_terms) {
      if (lowerText.includes(term.toLowerCase())) {
        bankingCount++;
      }
    }
    if (bankingCount >= 2) {
      scores.push(0.7);
      indicators.push(`Multiple banking terms detected (${bankingCount})`);
      rules.push('vn_banking_pattern');
      category = 'financial';
    }

    return { scores, indicators, rules, category };
  }

  private calculateConfidence(scores: number[]): number {
    if (scores.length === 0) return 0;
    
    // Use weighted average with boost for multiple indicators
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = sum / scores.length;
    
    // Boost confidence if multiple rules matched
    const boost = Math.min(scores.length * 0.05, 0.3);
    
    return Math.min(avg + boost, 1);
  }

  private determineCategory(indicators: string[], rules: string[]): ScamCategory {
    // Check indicators for category hints
    const indicatorText = indicators.join(' ').toLowerCase();
    
    if (indicatorText.includes('banking') || 
        indicatorText.includes('financial') ||
        indicatorText.includes('otp') ||
        indicatorText.includes('chuyển tiền')) {
      return 'financial';
    }
    
    if (indicatorText.includes('authority') || 
        indicatorText.includes('phishing') ||
        indicatorText.includes('impersonation')) {
      return 'phishing';
    }
    
    if (indicatorText.includes('investment') || 
        indicatorText.includes('đầu tư')) {
      return 'investment';
    }
    
    if (indicatorText.includes('fake') || 
        indicatorText.includes('giả mạo')) {
      return 'fake_goods';
    }
    
    return 'other';
  }

  // Utility method to check if text contains Vietnamese
  detectVietnameseContext(text: string): VietnameseContext {
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    const phonePattern = /(\+84|0)[0-9]{9,10}/;
    const bankAccountPattern = /\b[0-9]{9,14}\b/;
    
    return {
      hasVietnameseText: vietnameseChars.test(text),
      hasPhoneNumber: phonePattern.test(text),
      hasBankAccount: bankAccountPattern.test(text),
      hasAddress: text.includes('quận') || text.includes('phường') || text.includes('thành phố')
    };
  }
}