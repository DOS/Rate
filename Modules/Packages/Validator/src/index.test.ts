import { validateScamReport } from './index';

describe('validateScamReport', () => {
  it('should return valid=true for correct data', () => {
    const data = {
      phone: '0987654321',
      name: 'Nguyen Van A',
      bank: 'VCB',
      amount: 5000000,
      content: 'Lừa đảo chuyển khoản',
    };
    expect(validateScamReport(data)).toEqual({ valid: true, data });
  });

  it('should return valid=false if missing phone', () => {
    const data = {
      name: 'Nguyen Van B',
      bank: 'TCB',
      amount: 1000000,
      content: 'Scam',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/phone/i);
  });

  it('should return valid=false if phone is not string', () => {
    const data = {
      phone: 123456789,
      name: 'Nguyen Van C',
      bank: 'BIDV',
      amount: 2000000,
      content: 'Fake',
    };
    expect(validateScamReport(data)).toEqual({ valid: false, error: 'Missing or invalid phone' });
  });

  it('should return valid=false if missing name', () => {
    const data = {
      phone: '0123456789',
      bank: 'VCB',
      amount: 1000000,
      content: 'Scam',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/name/i);
  });

  it('should return valid=false if missing bank', () => {
    const data = {
      phone: '0123456789',
      name: 'Nguyen Van B',
      amount: 1000000,
      content: 'Scam',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/bank/i);
  });

  it('should return valid=false if amount < 1000', () => {
    const data = {
      phone: '0123456789',
      name: 'Nguyen Van B',
      bank: 'VCB',
      amount: 500,
      content: 'Scam',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/amount/i);
  });

  it('should return valid=false if content too short', () => {
    const data = {
      phone: '0123456789',
      name: 'Nguyen Van B',
      bank: 'VCB',
      amount: 1000000,
      content: '123',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/content/i);
  });

  it('should return valid=true with optional fields', () => {
    const data = {
      phone: '0987654321',
      name: 'Nguyen Van A',
      bank: 'VCB',
      amount: 5000000,
      content: 'Lừa đảo chuyển khoản',
      accountNumber: '123456789',
      category: 'bank scam',
      region: 'HCM',
      trustScore: 90,
      createdAt: '2025-06-09T10:00:00Z',
      updatedAt: '2025-06-09T10:05:00Z',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(true);
    expect(result.data).toEqual(data);
  });

  it('should return all errors if multiple fields are invalid', () => {
    const data = {
      phone: '',
      name: '',
      bank: '',
      amount: 500,
      content: '',
    };
    const result = validateScamReport(data);
    expect(result.valid).toBe(false);
    expect(result.issues && result.issues.length).toBeGreaterThan(1);
  });
});
