#!/usr/bin/env ts-node-esm
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateScamReport } from '@repo/validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CLIArgs {
  file?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) parsed.file = args[++i];
  }
  return parsed;
}

function loadSample(): any {
  return {
    phone: '0912345678',
    name: 'NGUYEN VAN A',
    bank: 'Vietcombank',
    bank_account: 'NGUYEN VAN A',
    amount: 1000000,
    content: 'Bị lừa chuyển khoản mua hàng online.',
    evidence_images: [],
    province: 'Hà Nội',
    source: 'checkscam',
    checkscam_id: 'sample-001',
    checkscam_url: 'https://checkscam.vn/example'
  };
}

function loadFromFile(filePath: string): any {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const { file } = parseArgs();
  const input = file ? loadFromFile(file) : loadSample();

  console.log('🔎 Running validator on input...');
  const result = await validateScamReport(input, {
    source: 'import',
    enrichData: true,
    stopOnError: false,
    checkDuplicates: false
  });

  console.log('--- Validation Result ---');
  console.log('isValid:', result.isValid);
  if (result.errors.length) {
    console.log('errors:', result.errors);
  }
  if (result.warnings.length) {
    console.log('warnings:', result.warnings);
  }
  console.log('data:', {
    phone: result.data?.phone_normalized ?? input.phone,
    phone_carrier: result.data?.phone_carrier,
    bank_normalized: result.data?.bank_normalized,
    bank_code: result.data?.bank_code,
    risk_score: result.data?.risk_score,
    quality_score: result.data?.quality_score
  });
}

main().catch((err) => {
  console.error('Validator run failed:', err);
  process.exit(1);
});


