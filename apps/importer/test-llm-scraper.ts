/**
 * Test LLM Scraper với PhoneArena
 *
 * Flow:
 * 1. Fetch HTML via FlareSolverr (bypass Cloudflare)
 * 2. Clean HTML
 * 3. Send to OpenAI for extraction
 */

import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function fetchWithFlareSolverr(url: string): Promise<string> {
  console.log(`🔧 Fetching via FlareSolverr: ${url}`);

  const response = await axios.post(FLARESOLVERR_URL, {
    cmd: 'request.get',
    url,
    maxTimeout: 60000,
  });

  if (response.data.status === 'ok') {
    console.log('✅ FlareSolverr success');
    return response.data.solution.response;
  }

  throw new Error('FlareSolverr failed: ' + JSON.stringify(response.data));
}

function cleanHTML(html: string): string {
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, nav, header, footer, aside, .ad, iframe, noscript').remove();

  // PhoneArena specific: get specs table
  const specsTable = $('.s-specs-table, .specs-table, [data-specs]').html();

  if (specsTable && specsTable.length > 500) {
    console.log(`📄 Found specs table (${specsTable.length} chars)`);
    return specsTable;
  }

  // Fallback: get main content
  const mainContent = $('main, article, .content, .specs-brief-specs').html();
  console.log(`📄 Using main content (${mainContent?.length || 0} chars)`);

  return mainContent || $('body').html() || html;
}

async function extractWithLLM(html: string, productName: string): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  console.log('🤖 Extracting with OpenAI...');

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const prompt = `Extract complete phone specifications from the HTML below.

Product: ${productName}

Return JSON with this structure:
{
  "name": "Full product name",
  "brand": "Brand name",
  "specs": {
    "Display": {
      "Size": "6.9 inches",
      "Type": "LTPO OLED, 120Hz",
      "Resolution": "1320 x 2868 pixels"
    },
    "Hardware": {
      "System chip": "Apple A18 Pro",
      "Processor": "CPU details",
      "GPU": "GPU details",
      "Memory": "8GB RAM"
    },
    "Camera": {
      "Main camera": "48 MP",
      "Second camera": "48 MP ultrawide",
      "Third camera": "12 MP telephoto",
      "Front": "12 MP"
    },
    "Battery": {
      "Type": "4685 mAh",
      "Charge speed": "25W MagSafe"
    },
    "Design": {
      "Dimensions": "163 x 77.6 x 8.25 mm",
      "Weight": "227 g",
      "Materials": "Titanium",
      "Colors": ["Desert", "Natural", "White", "Black"]
    },
    "Availability": {
      "Officially announced": "Sep 09, 2024",
      "Status": "Available"
    }
  }
}

HTML Content:
${html.slice(0, 15000)}

Return ONLY valid JSON, no markdown, no explanation.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const result = response.choices[0].message.content;
  console.log('✅ LLM extraction complete');

  return JSON.parse(result || '{}');
}

async function main() {
  const url = 'https://www.phonearena.com/phones/Apple-iPhone-16-Pro-Max_id11930';

  console.log('='.repeat(80));
  console.log('TEST: LLM SCRAPER WITH PHONEARENA');
  console.log('='.repeat(80));
  console.log();

  try {
    // Step 1: Fetch HTML via FlareSolverr
    const html = await fetchWithFlareSolverr(url);
    console.log(`📦 Fetched HTML: ${html.length} chars\n`);

    // Step 2: Clean HTML
    const cleanHtml = cleanHTML(html);
    console.log(`🧹 Cleaned HTML: ${cleanHtml.length} chars\n`);

    // Step 3: Extract with LLM
    const specs = await extractWithLLM(cleanHtml, 'iPhone 16 Pro Max');

    console.log();
    console.log('='.repeat(80));
    console.log('EXTRACTED SPECS:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(specs, null, 2));

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
