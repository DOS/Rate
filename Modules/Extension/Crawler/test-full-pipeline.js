/**
 * Test full validation pipeline: Extension Adapter + Core Validator
 */

const ExtensionAdapter = require('./extension-adapter.js');
const CoreValidator = require('./core-validator-v1.js');

// Simulate data from checkscam.com crawler
const crawledData = [
  {
    id: "real-1",
    owner: "NGUYEN VAN HUNG (0912345678)",
    account: "1234567890123",
    bank: "Vietcombank",
    amount: "5,500,000 đ",
    category: "Mua bán online",
    content: "Lừa đảo bán iPhone 15 Pro Max. Đã chuyển 5.5 triệu qua VCB, sau đó bị block Facebook và Zalo. Cảnh báo mọi người cẩn thận.",
    votes_up: "45",
    votes_down: "3",
    images: ["proof1.jpg", "proof2.jpg"]
  },
  {
    id: "real-2",
    owner: "TRAN THI LOAN",
    account: "9876543210",
    bank: "MB Bank",
    amount: "12,000,000",
    category: "Đầu tư",
    content: "Rủ đầu tư tiền ảo, cam kết lãi 30%/tháng. Sau khi nộp 12 triệu thì web sập, không liên lạc được.",
    votes_up: "89",
    votes_down: "5",
    images: []
  },
  {
    id: "real-3",
    owner: "LE MINH TUAN (0987654321)",
    account: "5555666677778888",
    bank: "Techcombank",
    amount: "3.200.000 VND",
    category: "Game",
    content: "Bán acc Liên Quân VIP, nhận tiền rồi đổi pass.",
    votes_up: "12",
    votes_down: "1",
    images: ["scam-proof.png"]
  },
  {
    id: "duplicate-1",
    owner: "NGUYEN VAN HUNG (0912345678)", // Duplicate of real-1
    account: "1234567890123",
    bank: "VCB",
    amount: "5500000",
    category: "Lừa đảo",
    content: "Lừa bán iPhone",
    votes_up: "10",
    votes_down: "0",
    images: []
  },
  {
    id: "invalid-1",
    owner: "", // Missing owner
    account: "123", // Too short
    bank: "Unknown Bank",
    amount: "abc",
    category: "",
    content: "",
    votes_up: "0",
    votes_down: "0",
    images: []
  }
];

async function testFullPipeline() {
  console.log('🚀 Testing Full Validation Pipeline\n');
  console.log(`📊 Input: ${crawledData.length} items from crawler\n`);
  
  try {
    // Step 1: Transform through Extension Adapter
    console.log('📦 Step 1: Extension Adapter Transformation');
    console.log('=========================================');
    
    const adapterResults = await ExtensionAdapter.transformBatch(
      crawledData,
      {
        url: 'https://checkscam.com',
        version: '1.0.0',
        mode: 'test',
        timestamp: new Date().toISOString()
      },
      (progress) => {
        console.log(`Transforming... ${progress.current}/${progress.total} (${progress.percentage}%)`);
      }
    );
    
    console.log(`\n✅ Adapter Results:`);
    console.log(`   - Success: ${adapterResults.summary.success}`);
    console.log(`   - Failed: ${adapterResults.summary.failed}`);
    
    // Get successfully transformed data
    const transformedData = adapterResults.results
      .filter(r => r.success)
      .map(r => r.data);
    
    console.log('\n📋 Transformed items:');
    transformedData.forEach((item, i) => {
      console.log(`${i + 1}. ${item.owner} | ${item.bank} | ${item.amount.toLocaleString('vi-VN')}đ | Trust: ${item._meta.trust_score.toFixed(2)}`);
    });
    
    // Step 2: Validate through Core Validator
    console.log('\n\n🔍 Step 2: Core Validator Validation');
    console.log('====================================');
    
    const validationResults = await CoreValidator.validateBatch(
      transformedData,
      (progress) => {
        console.log(`Validating... ${progress.current}/${progress.total} (${progress.percentage}%)`);
      }
    );
    
    console.log(`\n✅ Validation Results:`);
    console.log(`   - Valid: ${validationResults.summary.valid}`);
    console.log(`   - Invalid: ${validationResults.summary.invalid}`);
    console.log(`   - Total Warnings: ${validationResults.summary.totalWarnings}`);
    console.log(`   - Duplicates Found: ${validationResults.summary.duplicatesFound}`);
    
    // Show validation details
    console.log('\n📊 Validation Details:');
    validationResults.results.forEach((result, i) => {
      const status = result.isValid ? '✅' : '❌';
      console.log(`\n${i + 1}. ${status} ${result.data.owner || '(No owner)'}`);
      
      if (result.errors.length > 0) {
        console.log('   Errors:', result.errors);
      }
      
      if (result.warnings.length > 0) {
        console.log('   Warnings:', result.warnings);
      }
      
      if (result.isValid) {
        console.log(`   - Fraud Score: ${result.data.fraudScore}`);
        console.log(`   - Category: ${result.data.category}`);
        console.log(`   - Region: ${result.data.region || 'Unknown'}`);
      }
    });
    
    // Step 3: Get final valid data
    console.log('\n\n📤 Step 3: Final Output');
    console.log('======================');
    
    const validData = validationResults.results
      .filter(r => r.isValid)
      .map(r => r.data);
    
    console.log(`\n✅ Final valid records: ${validData.length}`);
    
    // Calculate statistics
    const stats = {
      totalAmount: validData.reduce((sum, item) => sum + (item.amount || 0), 0),
      byCategory: {},
      byBank: {},
      avgFraudScore: validData.reduce((sum, item) => sum + item.fraudScore, 0) / validData.length
    };
    
    validData.forEach(item => {
      stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
      stats.byBank[item.bank] = (stats.byBank[item.bank] || 0) + 1;
    });
    
    console.log('\n📊 Statistics:');
    console.log(`   - Total Amount: ${stats.totalAmount.toLocaleString('vi-VN')}đ`);
    console.log(`   - Average Fraud Score: ${stats.avgFraudScore.toFixed(2)}`);
    console.log(`   - By Category:`, stats.byCategory);
    console.log(`   - By Bank:`, stats.byBank);
    
    // Save sample output
    const output = {
      metadata: {
        pipeline_test: true,
        timestamp: new Date().toISOString(),
        input_count: crawledData.length,
        output_count: validData.length,
        stats: stats
      },
      data: validData
    };
    
    require('fs').writeFileSync(
      'test-pipeline-output.json',
      JSON.stringify(output, null, 2)
    );
    
    console.log('\n💾 Sample output saved to test-pipeline-output.json');
    console.log('\n🎉 Pipeline test complete!');
    
  } catch (error) {
    console.error('❌ Pipeline error:', error);
  }
}

// Run the test
testFullPipeline();
