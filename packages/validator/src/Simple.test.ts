import { baseSchema } from './ScamReportSchema';

describe('Simple Test', () => {
  it('should parse valid data', () => {
    const data = {
      phone: '0903123456',
      name: 'Test User',
      bank: 'Vietcombank',
      amount: 5000000,
      content: 'Test content for validation'
    };

    const result = baseSchema.safeParse(data);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('0903123456');
    }
  });
}); 