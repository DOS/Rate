import { validateScamReport } from './Index';
import { checkscamSchema, extensionSchema } from './ScamReportSchema';

describe('@ratebox/core-validator', () => {
  describe('Schema Validation', () => {
    it('should validate valid CheckScam data', async () => {
      const data = {
        source: 'checkscam',
        checkscam_id: '12345',
        checkscam_url: 'https://checkscam.vn/12345',
        phone: '0903123456',
        name: 'Nguyễn Văn A',
        bank: 'Vietcombank',
        amount: 5000000,
        content: 'Lừa đảo đầu tư forex với lãi suất cao'
      };

      const result = await validateScamReport(data);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data.source).toBe('checkscam');
    });

    it('should reject invalid phone format', async () => {
      const data = {
        phone: '123', // Too short
        name: 'Test',
        bank: 'VCB',
        amount: 1000
      };

      const result = await validateScamReport(data);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('phone');
    });
  });

  describe('Business Validation', () => {
    it('should normalize Vietnamese phone numbers', async () => {
      const testCases = [
        { input: '84903123456', expected: '0903123456' },
        { input: '+84903123456', expected: '0903123456' },
        { input: '0903123456', expected: '0903123456' },
        { input: '903123456', expected: '0903123456' }
      ];

      for (const testCase of testCases) {
        const result = await validateScamReport({
          phone: testCase.input,
          name: 'Test',
          bank: 'VCB',
          amount: 1000
        });
        
        expect(result.data.phone_normalized).toBe(testCase.expected);
      }
    });

    it('should detect phone carriers correctly', async () => {
      const testCases = [
        { phone: '0903123456', carrier: 'MobiFone' },
        { phone: '0983123456', carrier: 'Viettel' },
        { phone: '0843123456', carrier: 'Vinaphone' },
        { phone: '0563123456', carrier: 'Vietnamobile' }
      ];

      for (const testCase of testCases) {
        const result = await validateScamReport({
          phone: testCase.phone,
          name: 'Test',
          bank: 'VCB',
          amount: 1000
        });
        
        expect(result.data.phone_carrier).toBe(testCase.carrier);
      }
    });

    it('should normalize bank names', async () => {
      const testCases = [
        { input: 'vcb', expected: { name: 'Vietcombank', code: 'VCB' } },
        { input: 'TECHCOMBANK', expected: { name: 'Techcombank', code: 'TCB' } },
        { input: 'mb bank', expected: { name: 'MB Bank', code: 'MB' } },
        { input: 'ngan hang ngoai thuong', expected: { name: 'Vietcombank', code: 'VCB' } }
      ];

      for (const testCase of testCases) {
        const result = await validateScamReport({
          phone: '0903123456',
          name: 'Test',
          bank: testCase.input,
          amount: 1000
        });
        
        expect(result.data.bank_normalized).toBe(testCase.expected.name);
        expect(result.data.bank_code).toBe(testCase.expected.code);
      }
    });

    it('should detect suspicious content', async () => {
      const data = {
        phone: '0903123456',
        name: 'Test',
        bank: 'VCB',
        amount: 1000,
        content: 'Đầu tư forex với lãi suất cao, đảm bảo lợi nhuận'
      };

      const result = await validateScamReport(data);
      
      expect(result.warnings.some(w => w.code === 'SUSPICIOUS_CONTENT')).toBe(true);
      expect(result.data.content_category).toBe('Đầu tư');
    });
  });

  describe('Data Enrichment', () => {
    it('should calculate risk score', async () => {
      const highRiskData = {
        phone: '0903123456',
        name: 'Test',
        bank: 'VCB',
        amount: 100000000, // 100M VND
        content: 'Đầu tư crypto với lãi suất 50%/tháng'
      };

      const result = await validateScamReport(highRiskData);
      
      expect(result.data.risk_score).toBeGreaterThan(50);
      expect(result.data.content_category).toBe('Đầu tư');
    });

    it('should calculate quality score', async () => {
      const highQualityData = {
        phone: '0903123456',
        name: 'Nguyễn Văn A',
        bank: 'Vietcombank',
        bank_account: '1234567890',
        amount: 5000000,
        content: 'Tôi bị lừa mua hàng online qua Facebook. Đã chuyển tiền nhưng không nhận được hàng. Có hình ảnh chứng minh giao dịch.',
        email: 'test@example.com',
        province: 'Hà Nội',
        evidence_images: ['image1.jpg', 'image2.jpg'],
        reported_date: new Date().toISOString()
      };

      const result = await validateScamReport(highQualityData);
      
      expect(result.data.quality_score).toBeGreaterThan(70);
      expect(result.data.completeness_score).toBeGreaterThan(80);
    });

    it('should enrich location data', async () => {
      const data = {
        phone: '0903123456',
        name: 'Test',
        bank: 'VCB',
        amount: 1000,
        province: 'HCM'
      };

      const result = await validateScamReport(data);
      
      expect(result.data.province_code).toBe('HCM');
      expect(result.data.region).toBe('Miền Nam');
    });

    it('should generate unique ID', async () => {
      const data = {
        phone: '0903123456',
        name: 'Test',
        bank: 'VCB',
        amount: 1000,
        source: 'checkscam'
      };

      const result = await validateScamReport(data);
      
      expect(result.data.id).toBeDefined();
      expect(result.data.id).toMatch(/^CHE-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });

  describe('Configuration Options', () => {
    it('should stop on first error when configured', async () => {
      const data = {
        phone: '123', // Invalid phone - too short
        amount: 500   // Invalid amount - less than minimum 1000
      };

      const result = await validateScamReport(data, {
        stopOnError: true
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(2); // Both schema errors are collected at once
      expect(result.errors.some(e => e.field === 'phone')).toBe(true);
      expect(result.errors.some(e => e.field === 'amount')).toBe(true);
      // But it should not continue to BusinessValidator or EnrichmentValidator
      expect(result.warnings.length).toBe(0); // No warnings from other validators
    });

    it('should skip enrichment when disabled', async () => {
      const data = {
        phone: '0903123456',
        name: 'Test',
        bank: 'VCB',
        amount: 1000
      };

      const result = await validateScamReport(data, {
        enrichData: false
      });
      
      expect(result.data.risk_score).toBeUndefined();
      expect(result.data.quality_score).toBeUndefined();
    });
  });
});

describe('Source-specific Schemas', () => {
  it('should validate CheckScam schema', () => {
    const data = {
      source: 'checkscam' as const,
      checkscam_id: '12345',
      checkscam_url: 'https://checkscam.vn/12345',
      phone: '0903123456',
      name: 'Test',
      bank: 'VCB',
      amount: 1000
    };

    const result = checkscamSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate Extension schema', () => {
    const data = {
      source: 'extension' as const,
      user_agent: 'Mozilla/5.0',
      page_url: 'https://example.com',
      detected_at: new Date().toISOString(),
      phone: '0903123456'
    };

    const result = extensionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
