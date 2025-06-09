import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ValidationPusher {
  constructor(options = {}) {
    this.strapiUrl = options.strapiUrl || process.env.STRAPI_URL || 'http://localhost:1337';
    this.apiToken = options.apiToken || process.env.STRAPI_API_TOKEN;
    this.webhookUrl = options.webhookUrl || process.env.WEBHOOK_URL;
    
    if (!this.apiToken) {
      throw new Error('STRAPI_API_TOKEN is required');
    }
  }

  async pushForValidation(resultsFile) {
    try {
      console.log(`📤 Reading crawler results from: ${resultsFile}`);
      
      // Read crawl results
      const data = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      
      // Transform scammer data to validation format
      const items = data.scammers.map(scammer => ({
        url: scammer.url || `https://checkscam.vn/profile/${scammer.phone}`,
        title: scammer.name,
        description: scammer.content || 'No description',
        source_id: `cs_${scammer.phone || Date.now()}`,
        reported_date: new Date().toISOString().split('T')[0],
        metadata: {
          phone: scammer.phone,
          bank: scammer.bank,
          bank_account_name: scammer.bank_account_name,
          scam_amount: scammer.scam_amount,
          evidence_images: scammer.evidence_images || []
        }
      }));

      console.log(`📊 Sending ${items.length} items for validation`);

      // Send to Importer API for validation pipeline
      const response = await axios.post(
        `${this.strapiUrl}/api/importer/import`,
        {
          items,
          source: 'checkscam.vn',
          priority: 'batch',
          webhookUrl: this.webhookUrl
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Submitted to validation pipeline:', response.data);
      console.log('📍 Items will be validated before storage');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error submitting for validation:', error.response?.data || error.message);
      throw error;
    }
  }

  async checkStatus(requestId) {
    try {
      const response = await axios.get(
        `${this.strapiUrl}/api/importer/status/${requestId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Error checking status:', error.response?.data || error.message);
      throw error;
    }
  }
}

// CLI Usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, action, ...args] = process.argv;
  
  if (action === 'push' && args[0]) {
    const pusher = new ValidationPusher();
    pusher.pushForValidation(args[0])
      .then(result => {
        console.log('\n📍 Request ID:', result.requestId);
        console.log('⏳ Status:', result.status);
        console.log('💡 Check status with: node push-to-validation.js status', result.requestId);
      })
      .catch(err => process.exit(1));
      
  } else if (action === 'status' && args[0]) {
    const pusher = new ValidationPusher();
    pusher.checkStatus(args[0])
      .then(result => console.log(result))
      .catch(err => process.exit(1));
      
  } else {
    console.log('Usage:');
    console.log('  node push-to-validation.js push <crawler_results.json>');
    console.log('  node push-to-validation.js status <requestId>');
    console.log('\nEnvironment variables:');
    console.log('  STRAPI_URL (default: http://localhost:1337)');
    console.log('  STRAPI_API_TOKEN (required)');
    console.log('  WEBHOOK_URL (optional)');
    console.log('\nThis sends data to validation pipeline, not directly to Strapi content!');
  }
}

export default ValidationPusher;
