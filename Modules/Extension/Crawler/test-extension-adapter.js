/**
 * Test Extension Adapter with sample data from checkscam.com
 */

const ExtensionAdapter = require('./extension-adapter.js');

// Sample data from checkscam.com crawler
const sampleData = [
  {
    id: "scam-123",
    owner: "NGUYEN VAN A (0912345678)",
    account: "1234567890",
    bank: "Vietcombank",
    amount: "1,500,000 đ",
    category: "Game",
    content: "Lừa đảo bán acc game Liên Quân Mobile. Chuyển tiền xong block luôn.",
    votes_up: "15",
    votes_down: "2",
    images: ["https://checkscam.com/image1.jpg", "https://checkscam.com/image2.jpg"]
  },
  {
    id: "scam-456",
    owner: "TRAN THI B",
    account: "9876543210",
    bank: "MB Bank",
    amount: "3.000.000",
    category: "Mua bán online",
    content: "Rao bán điện thoại iPhone 14 Pro Max giá rẻ. Nhận tiền không giao hàng.",
    votes_up: "8",
    votes_down: "1",
    images: []
  },
  {
    id: "scam-789",
    owner: "LE VAN C (0987654321)",
    account: "555 666 777 8",
    bank: "TCB",
    amount: "500000",
    category: "",
    content: "Giả mạo shipper, lừa thu tiền COD",
    votes_up: "5",
    votes_down: "0",
    images: ["https://checkscam.com/evidence.png"]
  }
];

console.log('🧪 Testing Extension Adapter\n');

// Test 1: Single transformation
console.log('📝 Test 1: Single item transformation');
const single = ExtensionAdapter.transformSingle(sampleData[0], {
  url: 'https://checkscam.com',
  version: '1.0.0',
  mode: 'test'
});

console.log('Input:', sampleData[0]);
console.log('Output:', JSON.stringify(single, null, 2));
console.log('---\n');

// Test 2: Batch transformation
console.log('📝 Test 2: Batch transformation');
ExtensionAdapter.transformBatch(sampleData, {
  url: 'https://checkscam.com',
  version: '1.0.0',
  mode: 'test'
}, (progress) => {
  console.log(`Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`);
}).then(results => {
  console.log('\nBatch Results:', results.summary);
  
  // Show transformed data
  console.log('\n✅ Successfully transformed:');
  results.results.forEach((result, index) => {
    if (result.success) {
      console.log(`${index + 1}. ${result.data.owner} - ${result.data.bank} - Trust: ${result.data._meta.trust_score.toFixed(2)}`);
    }
  });
  
  // Test 3: Edge cases
  console.log('\n📝 Test 3: Edge cases');
  const edgeCases = [
    {
      id: "edge-1",
      owner: null,
      account: "",
      bank: "Unknown",
      amount: "không rõ",
      category: null,
      content: "",
      votes_up: "abc",
      votes_down: null
    },
    {
      id: "edge-2", 
      owner: "PHẠM THỊ D (not a phone)",
      account: "12345", // Too short
      bank: "VCB",
      amount: "$1,000 USD",
      category: "Crypto",
      content: "<script>alert('xss')</script>Lừa đảo crypto",
      votes_up: "100",
      votes_down: "50"
    }
  ];
  
  return ExtensionAdapter.transformBatch(edgeCases);
}).then(edgeResults => {
  console.log('Edge case results:', edgeResults.summary);
  
  edgeResults.results.forEach((result, index) => {
    if (result.success) {
      const data = result.data;
      console.log(`\nEdge ${index + 1}:`);
      console.log('  Owner:', data.owner || '(empty)');
      console.log('  Account:', data.account || '(empty)');
      console.log('  Bank:', data.bank);
      console.log('  Amount:', data.amount);
      console.log('  Phone:', data.phone || '(not found)');
      console.log('  Trust Score:', data._meta.trust_score.toFixed(2));
    } else {
      console.log(`\nEdge ${index + 1}: Failed - ${result.error}`);
    }
  });
  
  // Test 4: Data quality checks
  console.log('\n📝 Test 4: Data quality checks');
  const qualityChecks = {
    phoneExtraction: ExtensionAdapter.extractPhone("NGUYEN VAN A (0912345678)") === "0912345678",
    amountParsing: ExtensionAdapter.parseAmount("1,500,000 đ") === 1500000,
    bankNormalization: ExtensionAdapter.cleanBank("VCB") === "Vietcombank",
    ownerCleaning: ExtensionAdapter.cleanOwner("NGUYEN VAN A (0912345678)") === "NGUYEN VAN A",
    accountCleaning: ExtensionAdapter.cleanAccount("1234 5678 90") === "1234567890"
  };
  
  console.log('Quality checks:', qualityChecks);
  const passed = Object.values(qualityChecks).filter(v => v).length;
  console.log(`✅ Passed: ${passed}/${Object.keys(qualityChecks).length}`);
  
  console.log('\n🎉 Extension Adapter tests complete!');
}).catch(error => {
  console.error('❌ Test error:', error);
});
