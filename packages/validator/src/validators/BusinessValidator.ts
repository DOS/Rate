import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { ValidationConfig, ValidationResult, ValidationWarning } from '../Index';
import { normalizePhone, getCarrier } from '../utils/Phone';
import { normalizeBank } from '../utils/Bank';

export class BusinessValidator {
  private rules = {
    phone: {
      vietnam: /^(0|84|\+84)[3|5|7|8|9][0-9]{8}$/,
      validPrefixes: ['03', '05', '07', '08', '09', '84', '+84']
    },
    bank: {
      minAccountLength: 9,
      maxAccountLength: 19,
      validBanks: new Set([
        'vietcombank', 'vcb', 'techcombank', 'tcb', 'bidv', 'vietinbank',
        'mbbank', 'mb', 'sacombank', 'acb', 'tpbank', 'vpbank', 'agribank',
        'ocb', 'shb', 'hdbank', 'lienvietpostbank', 'vib', 'msb', 'seabank',
        'bacabank', 'kienlongbank', 'vietabank', 'namabank', 'pgbank',
        'gpbank', 'vietcapitalbank', 'baovietbank', 'dongabank', 'cbbank',
        'abbank', 'ncb', 'oceanbank'
      ])
    },
    amount: {
      min: 1000,
      max: 10000000000,
      suspiciousThreshold: 500000000
    },
    content: {
      minLength: 20,
      suspiciousKeywords: [
        'forex', 'coin', 'crypto', 'bitcoin', 'đầu tư', 'investment',
        'lãi suất', 'interest', 'cờ bạc', 'gambling', 'casino',
        'lô đề', 'xổ số', 'lottery', 'game bài', 'slot game'
      ]
    }
  };

  async validate(data: any, config?: ValidationConfig): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      data: { ...data }
    };

    // Validate phone
    if (data.phone) {
      const phoneValidation = this.validatePhone(data.phone);
      if (!phoneValidation.isValid) {
        result.warnings.push({
          code: 'INVALID_PHONE',
          field: 'phone',
          message: phoneValidation.message,
          value: data.phone
        });
      } else {
        result.data.phone_normalized = phoneValidation.normalized;
        result.data.phone_carrier = phoneValidation.carrier;
      }
    }

    // Validate bank
    if (data.bank || data.bank_account) {
      const bankValidation = this.validateBank(data.bank, data.bank_account);
      if (!bankValidation.isValid) {
        result.warnings.push({
          code: 'INVALID_BANK',
          field: 'bank',
          message: bankValidation.message,
          value: data.bank
        });
      } else {
        result.data.bank_normalized = bankValidation.normalized;
        result.data.bank_code = bankValidation.code;
      }
    }

    // Validate amount
    if (data.amount) {
      const amountValidation = this.validateAmount(data.amount);
      if (!amountValidation.isValid) {
        result.warnings.push({
          code: 'INVALID_AMOUNT',
          field: 'amount',
          message: amountValidation.message,
          value: data.amount
        });
      }
      if (amountValidation.suspicious) {
        result.warnings.push({
          code: 'SUSPICIOUS_AMOUNT',
          field: 'amount',
          message: amountValidation.message,
          value: data.amount
        });
      }
    }

    // Validate content
    if (data.content) {
      const contentValidation = this.validateContent(data.content);
      if (contentValidation.suspicious) {
        result.warnings.push({
          code: 'SUSPICIOUS_CONTENT',
          field: 'content',
          message: contentValidation.message,
          value: contentValidation.keywords
        });
      }
      result.data.content_category = contentValidation.category;
    }

    return result;
  }

  private validatePhone(phone: string) {
    const result = {
      isValid: false,
      normalized: phone,
      carrier: null as string | null,
      message: ''
    };

    try {
      // Normalize phone
      const normalized = normalizePhone(phone);
      result.normalized = normalized;

      // Check format
      if (!this.rules.phone.vietnam.test(normalized)) {
        result.message = 'Invalid Vietnamese phone format';
        return result;
      }

      // Detect carrier using Phone utility
      result.carrier = getCarrier(normalized);
      result.isValid = true;
    } catch (error) {
      result.message = 'Phone validation error';
    }
    
    return result;
  }

  private validateBank(bankName?: string, accountNumber?: string) {
    const result = {
      isValid: false,
      normalized: bankName || '',
      code: null as string | null,
      message: ''
    };

    if (!bankName) {
      result.message = 'Bank name is required';
      return result;
    }

    // Normalize bank name
    const normalized = normalizeBank(bankName);
    result.normalized = normalized.name;
    result.code = normalized.code;

    // Check if valid bank
    if (!this.rules.bank.validBanks.has(normalized.code.toLowerCase())) {
      result.message = `Unknown bank: ${bankName}`;
      return result;
    }

    // Validate account number if provided
    if (accountNumber) {
      const cleanAccount = accountNumber.replace(/\D/g, '');
      if (cleanAccount.length < this.rules.bank.minAccountLength ||
          cleanAccount.length > this.rules.bank.maxAccountLength) {
        result.message = `Invalid account number length: ${cleanAccount.length}`;
        return result;
      }
    }

    result.isValid = true;
    return result;
  }

  private validateAmount(amount: number | string) {
    const result = {
      isValid: true,
      suspicious: false,
      message: ''
    };

    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);

    if (isNaN(numAmount)) {
      result.isValid = false;
      result.message = 'Invalid amount format';
      return result;
    }

    if (numAmount < this.rules.amount.min) {
      result.isValid = false;
      result.message = `Amount too small: ${numAmount} VND`;
    } else if (numAmount > this.rules.amount.max) {
      result.isValid = false;
      result.message = `Amount too large: ${numAmount} VND`;
    } else if (numAmount > this.rules.amount.suspiciousThreshold) {
      result.suspicious = true;
      result.message = `Suspiciously large amount: ${numAmount.toLocaleString('vi-VN')} VND`;
    }

    return result;
  }

  private validateContent(content: string) {
    const result = {
      suspicious: false,
      category: 'Khác',
      keywords: [] as string[],
      message: ''
    };

    // Check for suspicious keywords
    const lowerContent = content.toLowerCase();
    const foundKeywords = this.rules.content.suspiciousKeywords.filter(
      keyword => lowerContent.includes(keyword)
    );

    if (foundKeywords.length > 0) {
      result.suspicious = true;
      result.keywords = foundKeywords;
      result.message = `Contains suspicious keywords: ${foundKeywords.join(', ')}`;
    }

    // Categorize content
    result.category = this.categorizeContent(content, foundKeywords);

    return result;
  }

  private categorizeContent(content: string, keywords: string[] = []) {
    const categories: Record<string, string[]> = {
      'Đầu tư': ['đầu tư', 'investment', 'forex', 'coin', 'crypto', 'bitcoin', 'lãi suất'],
      'Game': ['game', 'acc game', 'tài khoản game', 'nạp game'],
      'Vay tiền': ['vay', 'cho vay', 'tín dụng', 'khoản vay'],
      'Bán hàng': ['bán hàng', 'shop', 'order', 'đặt hàng', 'mua hàng'],
      'Tình cảm': ['tình cảm', 'quen qua mạng', 'hẹn hò', 'người yêu'],
      'Việc làm': ['việc làm', 'tuyển dụng', 'cộng tác viên', 'làm thêm'],
      'Cờ bạc': ['cờ bạc', 'gambling', 'casino', 'lô đề', 'xổ số', 'game bài']
    };

    const lowerContent = content.toLowerCase();
    
    // Check keywords first
    for (const keyword of keywords) {
      for (const [category, categoryKeywords] of Object.entries(categories)) {
        if (categoryKeywords.includes(keyword)) {
          return category;
        }
      }
    }

    // Check content
    for (const [category, categoryKeywords] of Object.entries(categories)) {
      for (const keyword of categoryKeywords) {
        if (lowerContent.includes(keyword)) {
          return category;
        }
      }
    }

    return 'Khác';
  }
} 