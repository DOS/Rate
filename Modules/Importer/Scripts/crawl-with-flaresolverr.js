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

    const links = [];
    
    // First try to find article/post links in main content area
    const articlePatterns = [
        // Article titles with links
        /<article[^>]*>.*?<a[^>]+href="(https:\/\/checkscam\.vn\/[^"]+)"[^>]*>([^<]+)<\/a>.*?<\/article>/gis,
        // Post titles in content area
        /<div[^>]*class="[^"]*post[^"]*"[^>]*>.*?<a[^>]+href="(https:\/\/checkscam\.vn\/[^"]+)"[^>]*>([^<]+)<\/a>.*?<\/div>/gis,
        // Entry titles
        /<div[^>]*class="[^"]*entry[^"]*"[^>]*>.*?<a[^>]+href="(https:\/\/checkscam\.vn\/[^"]+)"[^>]*>([^<]+)<\/a>.*?<\/div>/gis,
        // H2/H3 titles with links
        /<h[23][^>]*>.*?<a[^>]+href="(https:\/\/checkscam\.vn\/[^"]+)"[^>]*>([^<]+)<\/a>.*?<\/h[23]>/gis
    ];
    
    // Try each pattern
    for (const pattern of articlePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1];
            const name = match[2].trim();
            
            // Filter out navigation and system links
            if (!url.includes('/category/') && 
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
                !url.includes('loginSocial') &&
                name.length > 5) {
                
                links.push({
                    name: name,
                    url: url
                });
            }
        }
    }
    
    // If no articles found, try general link pattern but with stricter filtering
    if (links.length === 0) {
        console.log('🔍 No article links found, trying general pattern...');
        
        const linkPattern = /<a[^>]+href="(https:\/\/checkscam\.vn\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let match;
        
        while ((match = linkPattern.exec(html)) !== null) {
            const url = match[1];
            const name = match[2].trim();
            
            // Very strict filtering for individual posts
            if (url.match(/\/\d{4}\/\d{2}\/\d{2}\//) || // Date-based URLs
                url.match(/\/[^\/]+\/$/) && // Single post URLs
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
                !url.includes('loginSocial') &&
                name.length > 10 &&
                !name.match(/^(Điều khoản|Liên hệ|Quảng cáo|GIỚI THIỆU|QUỸ|Tố cáo|Đăng nhập)/i)) {
                
                links.push({
                    name: name,
                    url: url
                });
            }
        }
    }
    
    // Remove duplicates
    const uniqueLinks = links.filter((link, index, self) => 
        index === self.findIndex(l => l.url === link.url)
    );
    
    console.log(`🔍 Found ${uniqueLinks.length} potential scammer links`);
    
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
