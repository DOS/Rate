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
    expect(validateScamReport(data)).toEqual({ valid: true });
  });

  it('should return valid=false if missing phone', () => {
    const data = {
      name: 'Nguyen Van B',
      bank: 'TCB',
      amount: 1000000,
      content: 'Scam',
    };
    expect(validateScamReport(data)).toEqual({ valid: false, error: 'Missing or invalid phone' });
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
});
