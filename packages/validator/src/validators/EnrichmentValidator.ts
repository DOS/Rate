import geoip from 'geoip-lite';
import Fuse from 'fuse.js';
import { ValidationConfig, ValidationResult } from '../Index';

export class EnrichmentValidator {
  private vietnamProvinces = [
    { name: 'Hà Nội', code: 'HN', region: 'Miền Bắc' },
    { name: 'Hồ Chí Minh', code: 'HCM', region: 'Miền Nam' },
    { name: 'Đà Nẵng', code: 'DN', region: 'Miền Trung' },
    { name: 'Hải Phòng', code: 'HP', region: 'Miền Bắc' },
    { name: 'Cần Thơ', code: 'CT', region: 'Miền Nam' },
    { name: 'Bình Dương', code: 'BD', region: 'Miền Nam' },
    { name: 'Đồng Nai', code: 'DNai', region: 'Miền Nam' },
    { name: 'Quảng Ninh', code: 'QN', region: 'Miền Bắc' },
    { name: 'Bà Rịa - Vũng Tàu', code: 'VT', region: 'Miền Nam' },
    { name: 'Bắc Ninh', code: 'BN', region: 'Miền Bắc' },
    { name: 'Thừa Thiên Huế', code: 'TTH', region: 'Miền Trung' },
    { name: 'Nghệ An', code: 'NA', region: 'Miền Trung' },
    { name: 'Thanh Hóa', code: 'TH', region: 'Miền Bắc' },
    { name: 'Lâm Đồng', code: 'LD', region: 'Miền Nam' },
    { name: 'Khánh Hòa', code: 'KH', region: 'Miền Trung' },
    { name: 'Long An', code: 'LA', region: 'Miền Nam' },
    { name: 'Nam Định', code: 'ND', region: 'Miền Bắc' },
    { name: 'Quảng Nam', code: 'QNam', region: 'Miền Trung' },
    { name: 'Vĩnh Phúc', code: 'VP', region: 'Miền Bắc' },
    { name: 'Tây Ninh', code: 'TN', region: 'Miền Nam' },
    { name: 'Thái Nguyên', code: 'TNguyen', region: 'Miền Bắc' },
    { name: 'Bình Thuận', code: 'BT', region: 'Miền Trung' },
    { name: 'Hưng Yên', code: 'HY', region: 'Miền Bắc' },
    { name: 'Tiền Giang', code: 'TG', region: 'Miền Nam' },
    { name: 'Kiên Giang', code: 'KG', region: 'Miền Nam' }
  ];

  async validate(data: any, config?: ValidationConfig): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      data: { ...data }
    };

    // Skip enrichment if disabled
    if (config?.enrichData === false) {
      return result;
    }

    // Add timestamps
    if (!result.data.createdAt) {
      result.data.createdAt = new Date().toISOString();
    }
    result.data.updatedAt = new Date().toISOString();

    // Add source if not present
    if (!result.data.source) {
      result.data.source = config?.source || 'manual';
    }

    // Calculate risk score
    result.data.risk_score = this.calculateRiskScore(result.data);

    // Calculate trust indicators
    result.data.trust_indicators = this.calculateTrustIndicators(result.data);

    // Enrich location
    if (result.data.province) {
      const location = this.enrichLocation(result.data.province);
      if (location) {
        result.data.province_code = location.code;
        result.data.region = location.region;
      }
    }

    // Add completeness score
    result.data.completeness_score = this.calculateCompleteness(result.data);

    // Add quality score
    result.data.quality_score = this.calculateQualityScore(result.data);

    // Generate unique identifier
    if (!result.data.id) {
      result.data.id = this.generateUniqueId(result.data);
    }

    return result;
  }

  private calculateRiskScore(data: any): number {
    let score = 50; // Base score

    // High amount increases risk
    if (data.amount) {
      if (data.amount > 50000000) score += 20;
      else if (data.amount > 10000000) score += 10;
      else if (data.amount > 5000000) score += 5;
    }

    // Suspicious keywords increase risk
    if (data.content_category) {
      const highRiskCategories = ['Đầu tư', 'Cờ bạc', 'Vay tiền'];
      if (highRiskCategories.includes(data.content_category)) {
        score += 20;
      }
    }

    // Evidence decreases risk (more trust)
    if (data.evidence_images && data.evidence_images.length > 0) {
      score -= 10;
    }

    // Multiple identifiers decrease risk
    const identifiers = [data.phone, data.email, data.bank_account, data.facebook].filter(Boolean);
    if (identifiers.length >= 3) score -= 10;
    else if (identifiers.length === 2) score -= 5;

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }

  private calculateTrustIndicators(data: any): Record<string, boolean> {
    return {
      has_phone: !!data.phone && !!data.phone_normalized,
      has_bank: !!data.bank && !!data.bank_normalized,
      has_evidence: !!data.evidence_images && data.evidence_images.length > 0,
      has_multiple_identifiers: [data.phone, data.email, data.bank_account, data.facebook].filter(Boolean).length >= 2,
      has_detailed_content: !!data.content && data.content.length > 100,
      verified_phone: !!data.phone_carrier && data.phone_carrier !== 'Unknown',
      verified_bank: !!data.bank_code,
      high_completeness: this.calculateCompleteness(data) > 70
    };
  }

  private enrichLocation(province: string): { name: string; code: string; region: string } | null {
    // Handle common abbreviations
    const provinceAliases: Record<string, string> = {
      'HCM': 'Hồ Chí Minh',
      'TPHCM': 'Hồ Chí Minh',
      'SG': 'Hồ Chí Minh',
      'Saigon': 'Hồ Chí Minh',
      'HN': 'Hà Nội',
      'DN': 'Đà Nẵng',
      'CT': 'Cần Thơ'
    };

    const searchTerm = provinceAliases[province.toUpperCase()] || province;

    // Use fuzzy search to find province
    const fuse = new Fuse(this.vietnamProvinces, {
      keys: ['name', 'code'],
      threshold: 0.3
    });

    const results = fuse.search(searchTerm);
    return results.length > 0 ? results[0].item : null;
  }

  private calculateCompleteness(data: any): number {
    const fields = [
      'phone',
      'name',
      'bank',
      'bank_account',
      'amount',
      'content',
      'email',
      'facebook',
      'province',
      'evidence_images',
      'reported_date',
      'category'
    ];

    const filledFields = fields.filter(field => {
      const value = data[field];
      if (Array.isArray(value)) return value.length > 0;
      return !!value;
    });

    return Math.round((filledFields.length / fields.length) * 100);
  }

  private calculateQualityScore(data: any): number {
    let score = 0;
    const weights = {
      verified_phone: 15,
      verified_bank: 15,
      has_evidence: 20,
      detailed_content: 10,
      multiple_identifiers: 10,
      has_amount: 10,
      has_category: 5,
      has_location: 5,
      recent_report: 10
    };

    // Check each quality factor
    if (data.phone_carrier && data.phone_carrier !== 'Unknown') score += weights.verified_phone;
    if (data.bank_code) score += weights.verified_bank;
    if (data.evidence_images && data.evidence_images.length > 0) score += weights.has_evidence;
    if (data.content && data.content.length > 100) score += weights.detailed_content;
    if ([data.phone, data.email, data.bank_account].filter(Boolean).length >= 2) score += weights.multiple_identifiers;
    if (data.amount && data.amount > 0) score += weights.has_amount;
    if (data.category || data.content_category) score += weights.has_category;
    if (data.province || data.region) score += weights.has_location;
    
    // Check if report is recent (within 30 days)
    if (data.reported_date) {
      const reportDate = new Date(data.reported_date);
      const daysSince = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= 30) score += weights.recent_report;
    }

    return Math.min(100, score);
  }

  private generateUniqueId(data: any): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    const source = (data.source || 'unknown').substring(0, 3);
    
    return `${source}-${timestamp}-${random}`.toUpperCase();
  }
} 