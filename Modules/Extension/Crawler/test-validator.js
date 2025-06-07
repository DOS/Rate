// Test script for DataValidator
// Run with: node test-validator.js

const DataValidator = require('./data-validator.js');

// Test data with various cases
const testData = [
  // Valid case
  {
    id: "test-1",
    owner: "Nguyễn Văn A (0912345678)",
    account: "1234567890",
    bank: "vietcombank",
    amount: "1,500,000 đ",
    category: "",
    content: "Lừa đảo bán hàng online",
    votes_up: "5",
    votes_down: "1"
  },
  // Missing owner
  {
    id: "test-2",
    owner: "",
    account: "9876543210",
    bank: "MB BANK",
    amount: "500,000",
    content: "Scam game"
  },
  // Invalid account (too short)
  {
    id: "test-3",
    owner: "TRẦN THỊ B",
    account: "12345",
    bank: "techcombank",
    amount: "2,000,000 đ",
    content: "Lừa đảo &amp; chiếm đoạt tài sản"
  },
  // Duplicate account
  {
    id: "test-4",
    owner: "Lê Văn C",
    account: "1234567890",
    bank: "Vietcombank",
    amount: "3,000,000",
    content: "Another scam"
  },
  // Special characters in name
  {
    id: "test-5",
    owner: "Phạm Thị D @#$%",
    account: "111222333444",
    bank: "á châu",
    amount: "không rõ",
    content: "Test special chars"
  },
  // Valid with all fields
  {
    id: "test-6",
    owner: "Hoàng Văn E (0987654321)",
    account: "555666777888",
    bank: "TPBank",
    amount: "10,500,000 đ",
    category: "Game",
    content: "Lừa bán acc game &lt;script&gt;alert('xss')&lt;/script&gt;",
    votes_up: "10",
    votes_down: "2",
    images: ["image1.jpg", "image2.jpg"]
  }
];

console.log('=== TESTING DATA VALIDATOR ===\n');

// Test individual validation
console.log('1. Testing Individual Validation:');
console.log('-'.repeat(50));

testData.forEach((data, index) => {
  console.log(`\nTest Case ${index + 1}: ${data.owner || '(no owner)'}`);
  const result = DataValidator.validateScammer(data);
  
  console.log('Valid:', result.isValid ? '✅' : '❌');
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }
  if (result.warnings.length > 0) {
    console.log('Warnings:', result.warnings);
  }
  
  console.log('Cleaned data:');
  console.log('  Owner:', result.data.owner);
  console.log('  Account:', result.data.account);
  console.log('  Bank:', result.data.bank);
  console.log('  Amount:', result.data.amount, `(${result.data.amountText})`);
  if (result.data.phone) {
    console.log('  Phone:', result.data.phone);
  }
});

// Test batch processing
console.log('\n\n2. Testing Batch Processing:');
console.log('-'.repeat(50));

const batchResult = DataValidator.processBatch(testData);
console.log('\nBatch Results:');
console.log('Total:', batchResult.stats.total);
console.log('Valid:', batchResult.stats.valid);
console.log('Invalid:', batchResult.stats.invalid);
console.log('Warnings:', batchResult.stats.warnings);
console.log('Total Amount:', batchResult.stats.totalAmount.toLocaleString('vi-VN') + ' đ');
console.log('\nBy Bank:');
Object.entries(batchResult.stats.byBank).forEach(([bank, count]) => {
  console.log(`  ${bank}: ${count}`);
});

// Test duplicate removal
console.log('\n\n3. Testing Duplicate Removal:');
console.log('-'.repeat(50));

const deduped = DataValidator.removeDuplicates(batchResult.valid);
console.log('Unique entries:', deduped.unique.length);
console.log('Duplicates found:', deduped.duplicates.length);
if (deduped.duplicates.length > 0) {
  deduped.duplicates.forEach(dup => {
    console.log(`\nDuplicate: ${dup.duplicate.account} - ${dup.duplicate.bank}`);
    console.log('  Kept:', dup.kept.owner);
    console.log('  Removed:', dup.duplicate.owner);
  });
}

// Test specific functions
console.log('\n\n4. Testing Specific Functions:');
console.log('-'.repeat(50));

// Test bank normalization
const testBanks = ['vietcombank', 'VCB', 'mb bank', 'MB', 'techcombank', 'á châu', 'Unknown Bank'];
console.log('\nBank Normalization:');
testBanks.forEach(bank => {
  console.log(`  "${bank}" → "${DataValidator.normalizeBank(bank)}"`);
});

// Test amount parsing
const testAmounts = ['1,500,000 đ', '500000', '2.000.000', 'không rõ', '', '100k'];
console.log('\nAmount Parsing:');
testAmounts.forEach(amount => {
  console.log(`  "${amount}" → ${DataValidator.parseAmount(amount)}`);
});

// Test account validation
const testAccounts = ['123456789', '12345', '123456789012345678', 'ABC123', ''];
console.log('\nAccount Validation:');
testAccounts.forEach(account => {
  console.log(`  "${account}" → ${DataValidator.isValidAccount(account) ? '✅ Valid' : '❌ Invalid'}`);
});

console.log('\n=== TEST COMPLETE ===');
