#!/usr/bin/env node
/**
 * Integrated Crawl → Validate → Import Pipeline
 * Uses TypeScript validator for data quality
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { validateScamReport } from '@ratebox/core-validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  strapiUrl: process.env.STRAPI_URL || 'http://localhost:1337',
  strapiToken: process.env.STRAPI_API_TOKEN,
  batchSize: parseInt(process.env.BATCH_SIZE || '100'),
  validateBeforeImport: process.env.VALIDATE !== 'false'
};

class IntegratedPipeline {
  constructor() {
    if (!config.strapiToken) {
      throw new Error('STRAPI_API_TOKEN is required');
    }
  }

  async processCrawlResults(resultsFile) {
    console.log('🚀 Starting integrated pipeline...');
    
    // Read crawl results
    const rawData = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    console.log(`📊 Found ${rawData.scammers.length} items to process`);

    const results = {
      total: rawData.scammers.length,
      validated: 0,
      invalid: 0,
      imported: 0,
      errors: []
    };

    // Process in batches
    for (let i = 0; i < rawData.scammers.length; i += config.batchSize) {
      const batch = rawData.scammers.slice(i, i + config.batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/config.batchSize) + 1}...`);
      
      const validatedBatch = [];
      
      // Validate each item
      for (const scammer of batch) {
        try {
          const validationResult = await validateScamReport({
            // Map crawler data to validator schema
            phone: scammer.phone,
            name: scammer.name,
            bank: scammer.bank,
            bank_account: scammer.bank_account_name,
            amount: scammer.scam_amount,
            content: scammer.content,
            evidence_images: scammer.evidence_images,
            province: scammer.location,
            source: 'checkscam',
            checkscam_id: scammer.id || scammer.phone,
            checkscam_url: scammer.url
          }, {
            source: 'checkscam',
            enrichData: true
          });

          if (validationResult.isValid) {
            results.validated++;
            
            // Transform to Strapi format
            validatedBatch.push({
              url: validationResult.data.checkscam_url,
              title: validationResult.data.name,
              description: validationResult.data.content || 'No description',
              source_id: `cs_${validationResult.data.checkscam_id}`,
              reported_date: new Date().toISOString().split('T')[0],
              metadata: {
                phone: validationResult.data.phone_normalized,
                phone_carrier: validationResult.data.phone_carrier,
                bank: validationResult.data.bank_normalized,
                bank_code: validationResult.data.bank_code,
                bank_account_name: validationResult.data.bank_account,
                scam_amount: validationResult.data.amount,
                evidence_images: validationResult.data.evidence_images || [],
                province: validationResult.data.province,
                province_code: validationResult.data.province_code,
                region: validationResult.data.region,
                risk_score: validationResult.data.risk_score,
                quality_score: validationResult.data.quality_score,
                completeness_score: validationResult.data.completeness_score,
                trust_indicators: validationResult.data.trust_indicators,
                content_category: validationResult.data.content_category
              }
            });
          } else {
            results.invalid++;
            results.errors.push({
              item: scammer.phone || scammer.name,
              errors: validationResult.errors
            });
            console.log(`❌ Invalid: ${scammer.phone} - ${validationResult.errors[0]?.message}`);
          }
        } catch (error) {
          results.invalid++;
          results.errors.push({
            item: scammer.phone || scammer.name,
            error: error.message
          });
          console.error(`❌ Error validating ${scammer.phone}:`, error.message);
        }
      }

      // Import validated batch to Strapi
      if (validatedBatch.length > 0) {
        try {
          const response = await axios.post(
            `${config.strapiUrl}/api/importer/import`,
            {
              items: validatedBatch,
              source: 'checkscam.vn',
              priority: 'batch',
              metadata: {
                validated: true,
                validatorVersion: '1.0.0'
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${config.strapiToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          results.imported += validatedBatch.length;
          console.log(`✅ Imported ${validatedBatch.length} validated items`);
          console.log(`📍 Request ID: ${response.data.requestId}`);
        } catch (error) {
          console.error('❌ Import error:', error.response?.data || error.message);
          results.errors.push({
            batch: `${i}-${i + config.batchSize}`,
            error: error.response?.data || error.message
          });
        }
      }
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsPath = path.join(__dirname, '..', 'Results', `validated_import_${timestamp}.json`);
    
    fs.writeFileSync(resultsPath, JSON.stringify({
      ...results,
      timestamp,
      source_file: path.basename(resultsFile),
      config
    }, null, 2));

    console.log('\n📊 Pipeline Summary:');
    console.log(`   Total items: ${results.total}`);
    console.log(`   ✅ Validated: ${results.validated}`);
    console.log(`   ❌ Invalid: ${results.invalid}`);
    console.log(`   📤 Imported: ${results.imported}`);
    console.log(`   Results saved: ${path.basename(resultsPath)}`);

    return results;
  }
}

// CLI Usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, resultsFile] = process.argv;
  
  if (!resultsFile) {
    console.log('Usage: node crawl-validate-import.js <crawler_results.json>');
    console.log('\nEnvironment variables:');
    console.log('  STRAPI_URL (default: http://localhost:1337)');
    console.log('  STRAPI_API_TOKEN (required)');
    console.log('  BATCH_SIZE (default: 100)');
    console.log('  VALIDATE (default: true)');
    process.exit(1);
  }

  const pipeline = new IntegratedPipeline();
  pipeline.processCrawlResults(resultsFile)
    .catch(err => {
      console.error('Pipeline failed:', err);
      process.exit(1);
    });
}

export default IntegratedPipeline; 