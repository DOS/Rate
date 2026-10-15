/**
 * Create Strapi API Token via REST API
 *
 * This script creates an API token for the importer to use.
 * You need to be logged in to Strapi admin first.
 */

import axios from 'axios';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function login(email: string, password: string) {
  const response = await axios.post('http://localhost:1337/admin/login', {
    email,
    password,
  });
  return response.data.data.token;
}

async function createApiToken(jwtToken: string) {
  const response = await axios.post(
    'http://localhost:1337/admin/api-tokens',
    {
      name: 'PhoneArena Importer',
      description: 'Token for PhoneArena data import script',
      type: 'full-access',
      lifespan: null, // Never expires
    },
    {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    }
  );
  return response.data.data.accessKey;
}

async function main() {
  try {
    console.log('=== Strapi API Token Creator ===\n');

    const email = await question('Strapi admin email: ');
    const password = await question('Strapi admin password: ');

    console.log('\n🔐 Logging in...');
    const jwtToken = await login(email, password);

    console.log('✅ Logged in successfully');
    console.log('\n🔑 Creating API token...');

    const apiToken = await createApiToken(jwtToken);

    console.log('\n✅ API Token created successfully!');
    console.log('\n📋 Add this to your .env or apps/strapi/.env:');
    console.log(`\nSTRAPI_API_TOKEN=${apiToken}\n`);

    rl.close();
  } catch (error: any) {
    console.error('\n❌ Error:', error.response?.data?.error?.message || error.message);
    rl.close();
    process.exit(1);
  }
}

main();
