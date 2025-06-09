#!/usr/bin/env node
'use strict';

/**
 * Script to generate API tokens for Strapi
 * Usage: node generate-api-token.js
 */

const crypto = require('crypto');

console.log('\n🔑 Strapi API Token Generator\n');

// Generate different types of tokens
const tokens = {
  extension: {
    name: 'Rate Extension API Token',
    description: 'API token for browser extension validation requests',
    type: 'custom',
    permissions: ['api::validation.validation.validate', 'api::validation.validation.getStatus', 'api::validation.validation.batchValidate']
  },
  importer: {
    name: 'Rate Importer API Token',
    description: 'API token for bulk import operations',
    type: 'full-access',
    permissions: ['api::importer.importer.import', 'api::importer.importer.getStatus', 'api::importer.importer.bulkImport']
  },
  monitoring: {
    name: 'Monitoring API Token',
    description: 'Read-only token for monitoring and status checks',
    type: 'read-only',
    permissions: ['api::validation.validation.getStatus', 'api::importer.importer.getStatus']
  }
};

console.log('📋 Generated API Token Configuration:\n');

Object.entries(tokens).forEach(([key, config]) => {
  const token = crypto.randomBytes(32).toString('hex');
  
  console.log(`${key.toUpperCase()} Token:`);
  console.log(`Name: ${config.name}`);
  console.log(`Description: ${config.description}`);
  console.log(`Type: ${config.type}`);
  console.log(`Token: ${token}`);
  console.log(`Permissions: ${config.permissions.join(', ')}`);
  console.log('\n---\n');
});

console.log('🔧 How to add these tokens to Strapi:\n');
console.log('1. Go to Strapi Admin Panel: http://localhost:1337/admin');
console.log('2. Navigate to Settings > API Tokens');
console.log('3. Click "Create new API Token"');
console.log('4. Enter the token details above');
console.log('5. Select the appropriate permissions');
console.log('6. Save the token');
console.log('\n💡 Note: Store these tokens securely and never commit them to version control!');

// Generate example .env entries
console.log('\n📄 Example .env entries:\n');
console.log('# API Tokens for Redis Stream Integration');
console.log(`STRAPI_EXTENSION_API_TOKEN=${crypto.randomBytes(32).toString('hex')}`);
console.log(`STRAPI_IMPORTER_API_TOKEN=${crypto.randomBytes(32).toString('hex')}`);
console.log(`STRAPI_MONITORING_API_TOKEN=${crypto.randomBytes(32).toString('hex')}`);
