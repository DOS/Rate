import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const BASE_URL = 'https://checkscam.vn/';
const MAX_TIMEOUT = 60000;

async function fetchWithFlareSolverr(url) {
    const payload = {
        cmd: 'request.get',
        url: url,
        maxTimeout: MAX_TIMEOUT
    };

    try {
        console.log(`🔥 FlareSolverr fetching: ${url}`);
        const response = await axios.post(FLARESOLVERR_URL, payload, {
            timeout: MAX_TIMEOUT + 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data.status === 'ok') {
            console.log(`✅ FlareSolverr success: ${response.data.solution.response.length} chars`);
            return response.data.solution.response;
        } else {
            throw new Error(`FlareSolverr error: ${response.data.message}`);
        }
    } catch (error) {
        console.error(`❌ FlareSolverr failed for ${url}:`, error.message);
        throw error;
    }
}

function extractScammerLinks(html) {
    console.log('🔍 HTML structure:');
    console.log(html.substring(0, 200) + '...');

    // Sử dụng regex giống script test_flaresolverr_list.js
    const matches = [...html.matchAll(/<div class="ct1">\s*<a href="([^"]+)">/g)];
    const links = [];
    for (const m of matches) {
        const url = m[1];
        // Loại bỏ các link hệ thống, chỉ lấy link scammer thực sự
        if (
            url.startsWith('https://checkscam.vn/') &&
            !url.includes('/category/') &&
            !url.includes('/page/') &&
            !url.includes('/tag/') &&
            !url.includes('checkscam.vn/#') &&
            !url.includes('/wp-') &&
            !url.includes('/dieu-khoan') &&
            !url.includes('/lien-he') &&
            !url.includes('/marketing') &&
            !url.includes('/gioi-thieu') &&
            !url.includes('/dich-vu') &&
            !url.includes('/to-cao') &&
            !url.includes('loginSocial')
        ) {
            links.push({
                name: url.split('/').pop(),
                url: url
            });
        }
    }
    // Remove duplicates
    const uniqueLinks = links.filter((link, index, self) =>
        index === self.findIndex(l => l.url === link.url)
    );
    console.log(`🔍 Found ${uniqueLinks.length} <div class=\"ct1\"><a ...> scammer links`);
    return uniqueLinks;
}

async function saveToFile(data, filename) {
    try {
        const resultsDir = path.join(__dirname, '../Results');
        await fs.mkdir(resultsDir, { recursive: true });
        
        const filePath = path.join(resultsDir, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        
        console.log(`📁 Saved: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error(`❌ Save error:`, error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🚀 Starting CheckScam.vn link extraction with FlareSolverr...\n');
        
        // Fetch the main page
        const html = await fetchWithFlareSolverr(BASE_URL);
        
        // Extract scammer links
        console.log('🔍 Extracting scammer links...');
        const links = extractScammerLinks(html);
        
        if (links.length === 0) {
            console.log('⚠️ No scammer links found');
            return;
        }
        
        console.log(`✅ Found ${links.length} scammer links`);
        
        // Prepare output data
        const timestamp = new Date().toISOString();
        const outputData = {
            timestamp: timestamp,
            source: BASE_URL,
            total_links: links.length,
            links: links
        };
        
        // Save to file
        const filename = `scam_links_${timestamp.replace(/[:.]/g, '-')}.json`;
        await saveToFile(outputData, filename);
        
        // Display summary
        console.log('\n📋 Extracted Links:');
        links.slice(0, 10).forEach((link, index) => {
            console.log(`${index + 1}. ${link.name} - ${link.url}`);
        });
        
        if (links.length > 10) {
            console.log(`... and ${links.length - 10} more links`);
        }
        
        console.log(`\n✅ Link extraction completed!`);
        console.log(`📊 Total: ${links.length} scammer links`);
        console.log(`📁 Saved to: Results/${filename}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the script
main();
