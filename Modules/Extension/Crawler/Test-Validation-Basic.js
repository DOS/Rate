// Test-Validation-Basic.js
// Đơn vị test cho Validation-Basic.js (chạy với Node.js)
const { basicValidate } = require('./Validation-Basic');

const testCases = [
  {
    name: 'Valid VN Record',
    record: { phone: '0987654321', account: '12345678', content: 'Chuyển khoản lừa đảo ngân hàng Vietcombank.' },
    options: { country: 'VN' },
    expectFlags: [],
    expectScore: 100
  },
  {
    name: 'Invalid Phone',
    record: { phone: '12345', account: '12345678', content: 'Lừa đảo.' },
    options: { country: 'VN' },
    expectFlags: ['INVALID_PHONE', 'SHORT_CONTENT'],
    expectScore: 20
  },
  {
    name: 'Invalid Account',
    record: { phone: '0987654321', account: 'abc123', content: 'Lừa đảo chuyển khoản.' },
    options: { country: 'VN' },
    expectFlags: ['INVALID_ACCOUNT'],
    expectScore: 80
  },
  {
    name: 'Short Content',
    record: { phone: '0987654321', account: '12345678', content: 'Lừa đảo' },
    options: { country: 'VN' },
    expectFlags: ['SHORT_CONTENT'],
    expectScore: 50
  },
  {
    name: 'All Invalid',
    record: { phone: '1', account: '1', content: '' },
    options: { country: 'VN' },
    expectFlags: ['INVALID_PHONE', 'INVALID_ACCOUNT', 'SHORT_CONTENT'],
    expectScore: 0
  }
];

console.log('--- Test Basic Validation (VN) ---');
testCases.forEach(({ name, record, options, expectFlags, expectScore }) => {
  const result = basicValidate(record, options);
  const passFlags = JSON.stringify(result.flags.sort()) === JSON.stringify(expectFlags.sort());
  const passScore = result.score === expectScore;
  console.log(`${name}:`, passFlags && passScore ? '✅ PASS' : '❌ FAIL',
    '| Flags:', result.flags, '| Score:', result.score);
});
