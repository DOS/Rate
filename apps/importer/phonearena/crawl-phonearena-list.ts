/**
 * Crawl PhoneArena phone list and specs
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface FlareSolverrResponse {
  solution: {
    status: number;
    response: string;
    url: string;
  };
}

async function getPhoneListWithFlare(): Promise<string[]> {
  console.log('\n🔍 Fetching phone list from PhoneArena...\n');

  try {
    const flareResponse = await axios.post<FlareSolverrResponse>(
      'http://localhost:8191/v1',
      {
        cmd: 'request.get',
        url: 'https://www.phonearena.com/phones',
        maxTimeout: 120000, // Tăng lên 120s cho listing page
      },
      { timeout: 125000 }
    );

    if (flareResponse.data.solution.status === 200) {
      const html = flareResponse.data.solution.response;

      // DEBUG: Save HTML only if no matches found
      // Removed to speed up execution

      // Parse phone URLs from HTML
      // PhoneArena format: <a href="https://www.phonearena.com/phones/Apple-iPhone-17-Pro-Max_id12496">
      // Or: <a href="/phones/Apple-iPhone-17-Pro-Max_id12496">
      const urlRegex = /href="((?:https:\/\/www\.phonearena\.com)?\/phones\/[^"]+_id\d+)"/g;
      const matches = [...html.matchAll(urlRegex)];

      console.log(`🔍 Regex found ${matches.length} matches`);
      if (matches.length > 0) {
        console.log(`📌 First 3 matches:`, matches.slice(0, 3).map(m => m[1]));
      }

      const urls = matches
        .map(m => {
          const url = m[1];
          return url.startsWith('http') ? url : `https://www.phonearena.com${url}`;
        })
        .filter((url, idx, arr) => arr.indexOf(url) === idx) // Unique
        .slice(0, 5); // Top 5 phones để test nhanh (có thể thay đổi sau)

      console.log(`✅ Found ${urls.length} phones\n`);
      return urls;
    }
  } catch (error: any) {
    console.error('❌ Failed to fetch phone list:', error.message);
  }

  return [];
}

async function crawlPhoneSpecs(url: string): Promise<any> {
  try {
    console.log(`  🌐 Crawling: ${url}`);

    const flareResponse = await axios.post<FlareSolverrResponse>(
      'http://localhost:8191/v1',
      {
        cmd: 'request.get',
        url: url,
        maxTimeout: 120000, // Tăng lên 120s
      },
      { timeout: 125000 }
    );

    if (flareResponse.data.solution.status === 200) {
      const html = flareResponse.data.solution.response;
      const specs = parsePhoneArenaHTML(html);

      if (specs && Object.keys(specs).length > 0) {
        console.log(`  ✅ Crawled ${Object.keys(specs).length} categories\n`);
        return { url, specs };
      }
    }
  } catch (error: any) {
    console.error(`  ❌ Failed: ${error.message}`);
  }

  return null;
}

function parsePhoneArenaHTML(html: string): Record<string, any> {
  const specs: Record<string, Record<string, string>> = {};

  const categories = [
    'Availability',
    'Design',
    'Display',
    'Hardware',
    'Battery',
    'Camera',
    'Connectivity & Features',
    'Multimedia',
    'Cellular',
    'Regulatory Approval',
  ];

  for (const category of categories) {
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;');
    const categoryRegex = new RegExp(
      `<h3[^>]*>.*?${escapedCategory}</h3>[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>`,
      'i'
    );
    const match = html.match(categoryRegex);

    if (match) {
      const tbody = match[1];
      const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*>([^<]+)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/g;
      let rowMatch;
      const categorySpecs: Record<string, string> = {};

      while ((rowMatch = rowRegex.exec(tbody)) !== null) {
        const key = rowMatch[1].trim();
        let value = rowMatch[2].replace(/<[^>]+>/g, ' ').trim().replace(/\s+/g, ' ');

        if (value && value !== 'N/A') {
          categorySpecs[key] = value;
        }
      }

      if (Object.keys(categorySpecs).length > 0) {
        specs[category] = categorySpecs;
      }
    }
  }

  return specs;
}

// Main
(async () => {
  console.log('='.repeat(80));
  console.log('PHONEARENA BATCH CRAWLER');
  console.log('='.repeat(80));

  // Get phone list
  const phoneUrls = await getPhoneListWithFlare();

  if (phoneUrls.length === 0) {
    console.error('❌ No phones found');
    process.exit(1);
  }

  // Crawl each phone
  const results = [];
  for (let i = 0; i < phoneUrls.length; i++) {
    console.log(`[${i + 1}/${phoneUrls.length}]`);
    const result = await crawlPhoneSpecs(phoneUrls[i]);
    if (result) {
      results.push(result);
    }

    // Delay between requests (500ms thay vì 2s)
    if (i < phoneUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Save to file
  const outputDir = path.join(process.cwd(), 'Data', 'crawled');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `phonearena-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Crawled ${results.length} phones`);
  console.log(`📁 Saved to: ${outputFile}`);
  console.log('='.repeat(80));
})();
