/**
 * Crawl PhoneArena specs using FlareSolverr (bypass Cloudflare)
 */

import axios from 'axios';

interface FlareSolverrResponse {
  solution: {
    status: number;
    response: string;
    url: string;
  };
}

async function crawlPhoneArenaWithFlare(url: string) {
  console.log(`\n🔍 Crawling PhoneArena: ${url}\n`);

  // Use provided URL
  const possibleUrls = [url];

  for (const url of possibleUrls) {
    try {
      console.log(`  🌐 Trying: ${url}`);

      // Request to FlareSolverr
      const flareResponse = await axios.post<FlareSolverrResponse>(
        'http://localhost:8191/v1',
        {
          cmd: 'request.get',
          url: url,
          maxTimeout: 90000, // 90 seconds to bypass Cloudflare
        },
        {
          timeout: 95000, // Axios timeout slightly higher
        }
      );

      if (flareResponse.data.solution.status === 200) {
        const html = flareResponse.data.solution.response;

        // Parse HTML to extract specs
        const specs = parsePhoneArenaHTML(html);

        if (specs && Object.keys(specs).length > 0) {
          console.log(`  ✅ Found ${Object.keys(specs).length} categories!`);
          return { url, specs };
        } else {
          console.log(`  ⚠️ No specs extracted from HTML`);
        }
      } else {
        console.log(`  ⚠️ Non-200 status from target site: ${flareResponse.data.solution.status}`);
      }
    } catch (error: any) {
      console.error(`  ❌ Failed: ${error.message}`);
      if (error.response) {
        console.error(`  Response status: ${error.response.status}`);
        console.error(`  Response data:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.error(`  Full error:`, error);
      }
    }
  }

  return null;
}

function parsePhoneArenaHTML(html: string): Record<string, any> {
  const specs: Record<string, Record<string, string>> = {};

  // Extract sections from HTML
  // PhoneArena structure: <h3><i class="ic ic-availability"></i>Availability</h3>
  const categories = [
    'Availability',
    'Design',
    'Display',
    'Hardware',
    'Battery',
    'Camera',
    'Connectivity & Features', // Note: HTML uses &amp;
    'Multimedia',
    'Cellular',
    'Regulatory Approval',
  ];

  for (const category of categories) {
    // Find category section - PhoneArena has <i> icon inside <h3>
    // Escape special regex characters and handle HTML entities
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;');
    const categoryRegex = new RegExp(
      `<h3[^>]*>.*?${escapedCategory}</h3>[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>`,
      'i'
    );
    const match = html.match(categoryRegex);

    if (match) {
      const tbody = match[1];

      // Extract rows
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

function printSpecs(specs: Record<string, Record<string, string>>) {
  console.log('\n' + '='.repeat(80));
  console.log('PHONEARENA SPECIFICATIONS');
  console.log('='.repeat(80));

  const categories = Object.keys(specs);
  console.log(`\nTotal Categories: ${categories.length}\n`);

  categories.forEach((category, idx) => {
    const fields = specs[category];
    const fieldCount = Object.keys(fields).length;

    console.log(`\n[${idx + 1}/${categories.length}] ${category.toUpperCase()} (${fieldCount} fields)`);
    console.log('-'.repeat(80));

    Object.entries(fields).forEach(([key, value]) => {
      const displayValue = value.length > 80 ? value.substring(0, 77) + '...' : value;
      console.log(`  • ${key}: ${displayValue}`);
    });
  });

  console.log('\n' + '='.repeat(80));
}

// Main
const url = process.argv[2];

if (!url) {
  console.error('❌ Usage: yarn tsx crawl-phonearena-flaresolverr.ts <PHONEARENA_URL>');
  process.exit(1);
}

crawlPhoneArenaWithFlare(url).then((result) => {
  if (result) {
    console.log(`\n✅ Successfully crawled: ${result.url}`);
    printSpecs(result.specs);
  } else {
    console.log('\n❌ Failed to crawl PhoneArena');
  }
}).catch((error) => {
  console.error('❌ Error:', error.message);
});