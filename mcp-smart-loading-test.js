// MCP Playwright Test for Smart Loading
const axios = require('axios');

const MCP_SERVER_URL = 'http://localhost:8931';

async function sendMCPRequest(method, params = {}) {
  try {
    console.log(`📡 Sending MCP request: ${method}`, params);
    const response = await axios.post(`${MCP_SERVER_URL}/mcp`, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    });
    
    console.log(`✅ MCP response for ${method}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ MCP Request failed for ${method}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return null;
  }
}

async function testMCPConnection() {
  console.log('🔗 Testing MCP connection...');
  
  try {
    // Test basic connection
    const response = await axios.get(`${MCP_SERVER_URL}`);
    console.log('✅ MCP server is reachable');
    
    // Try to list available methods
    const listResult = await sendMCPRequest('tools/list');
    if (listResult) {
      console.log('📋 Available MCP tools:', listResult);
    }
    
    return true;
  } catch (error) {
    console.error('❌ MCP connection failed:', error.message);
    return false;
  }
}

async function testSmartLoadingWithMCP() {
  console.log('🎯 Starting Smart Loading test with MCP Playwright...');
  
  // First test MCP connection
  const mcpConnected = await testMCPConnection();
  if (!mcpConnected) {
    console.error('❌ Cannot connect to MCP server. Make sure it\'s running on port 8931');
    return;
  }
  
  try {
    // 1. Initialize browser
    console.log('🌐 Initializing browser...');
    const initResult = await sendMCPRequest('playwright/launch', {
      headless: false,
      slowMo: 1000
    });
    
    if (!initResult || initResult.error) {
      console.error('❌ Failed to initialize browser:', initResult?.error);
      
      // Try alternative method
      console.log('🔄 Trying alternative browser launch...');
      const altResult = await sendMCPRequest('browser/launch', {
        headless: false
      });
      
      if (!altResult || altResult.error) {
        console.error('❌ Alternative browser launch also failed:', altResult?.error);
        return;
      }
    }
    
    console.log('✅ Browser initialized');
    
    // 2. Navigate to Strapi admin
    console.log('🔗 Navigating to Strapi admin...');
    const navResult = await sendMCPRequest('page/goto', {
      url: 'http://localhost:1337/admin'
    });
    
    if (navResult?.error) {
      console.error('❌ Navigation failed:', navResult.error);
      
      // Try alternative navigation
      const altNavResult = await sendMCPRequest('playwright/goto', {
        url: 'http://localhost:1337/admin'
      });
      
      if (altNavResult?.error) {
        console.error('❌ Alternative navigation also failed:', altNavResult.error);
        return;
      }
    }
    
    console.log('✅ Navigated to Strapi admin');
    
    // 3. Test API endpoints directly (this should work regardless of UI)
    console.log('🔌 Testing API endpoints directly...');
    
    try {
      // Test Bank API
      const bankResponse = await axios.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
      console.log('🏦 Bank API Direct Test:');
      console.log(`   Status: ${bankResponse.status}`);
      console.log(`   Data:`, bankResponse.data);
      
      // Test Scammer API
      const scammerResponse = await axios.get('http://localhost:1337/api/smart-component-filter/listing-type/1/components');
      console.log('\n🚨 Scammer API Direct Test:');
      console.log(`   Status: ${scammerResponse.status}`);
      console.log(`   Data:`, scammerResponse.data);
      
      if (bankResponse.status === 200 && scammerResponse.status === 200) {
        console.log('✅ API endpoints working correctly!');
        
        // Validate data structure
        const bankData = bankResponse.data;
        const scammerData = scammerResponse.data;
        
        if (bankData.success && bankData.data.listingType.name === 'Bank') {
          console.log('✅ Bank API returns correct data structure');
          console.log(`   Components: ${bankData.data.allowedComponents.join(', ')}`);
        }
        
        if (scammerData.success && scammerData.data.listingType.name === 'Scammer') {
          console.log('✅ Scammer API returns correct data structure');
          console.log(`   Components: ${scammerData.data.allowedComponents.join(', ')}`);
        }
        
        // Test component filtering logic
        console.log('\n🧪 Testing component filtering logic...');
        
        const bankComponents = bankData.data.allowedComponents;
        const scammerComponents = scammerData.data.allowedComponents;
        
        // Check Bank components
        const bankHasContact = bankComponents.some(c => c.includes('contact'));
        const bankHasBusiness = bankComponents.some(c => c.includes('business'));
        const bankHasViolation = bankComponents.some(c => c.includes('violation'));
        
        console.log('🏦 Bank Component Analysis:');
        console.log(`   Has contact components: ${bankHasContact}`);
        console.log(`   Has business components: ${bankHasBusiness}`);
        console.log(`   Has violation components: ${bankHasViolation} (should be false)`);
        
        // Check Scammer components
        const scammerHasContact = scammerComponents.some(c => c.includes('contact'));
        const scammerHasBusiness = scammerComponents.some(c => c.includes('business'));
        const scammerHasViolation = scammerComponents.some(c => c.includes('violation'));
        
        console.log('\n🚨 Scammer Component Analysis:');
        console.log(`   Has contact components: ${scammerHasContact}`);
        console.log(`   Has business components: ${scammerHasBusiness} (should be false)`);
        console.log(`   Has violation components: ${scammerHasViolation}`);
        
        // Validate filtering logic
        if (bankHasContact && bankHasBusiness && !bankHasViolation) {
          console.log('✅ Bank filtering logic is correct');
        } else {
          console.log('❌ Bank filtering logic has issues');
        }
        
        if (scammerHasContact && !scammerHasBusiness && scammerHasViolation) {
          console.log('✅ Scammer filtering logic is correct');
        } else {
          console.log('❌ Scammer filtering logic has issues');
        }
        
      } else {
        console.log('❌ API endpoints have issues');
      }
      
    } catch (apiError) {
      console.error('❌ Direct API test failed:', apiError.message);
    }
    
    console.log('\n🎉 Smart Loading MCP test completed!');
    
    // Try to close browser if it was opened
    try {
      await sendMCPRequest('browser/close');
      console.log('✅ Browser closed');
    } catch (closeError) {
      console.log('⚠️ Could not close browser (might not have been opened)');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSmartLoadingWithMCP().then(() => {
  console.log('🏁 MCP Smart Loading test finished');
}).catch(error => {
  console.error('💥 Test crashed:', error.message);
}); 