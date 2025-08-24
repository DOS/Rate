import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Files and directories to remove
const itemsToRemove = [
    // Old crawler scripts (moved to Scripts/)
    'crawlee-crawler.js',
    'test-crawler.js', 
    'test-crawler.cjs',
    'test-playwright.cjs',
    
    // Screenshot files
    'debug_screenshot.png',
    'page-loaded.png', 
    'post_screenshot.png',
    'screenshot.png',
    
    // Build/dist directories
    'dist',
    
    // Log directories (will be recreated if needed)
    'Logs',
    
    // Duplicate config files
    '.eslintrc.cjs',  // Keep .eslintrc.json
];

// Directories that should exist after cleanup
const requiredDirectories = [
    'Scripts',
    'Results'
];

async function removeItem(itemPath, itemName) {
    try {
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
            await fs.rm(itemPath, { recursive: true });
            console.log(`📁 Removed directory: ${itemName}`);
        } else {
            await fs.unlink(itemPath);
            console.log(`📄 Removed file: ${itemName}`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.log(`⚠️ Could not remove ${itemName}: ${error.message}`);
        }
    }
}

async function ensureDirectory(dirPath, dirName) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✅ Ensured directory exists: ${dirName}`);
    } catch (error) {
        console.log(`⚠️ Could not create directory ${dirName}: ${error.message}`);
    }
}

async function cleanup() {
    console.log('🧹 Starting Rate-Importer cleanup...\n');
    
    // Remove obsolete items
    console.log('📋 Removing obsolete files and directories:');
    for (const item of itemsToRemove) {
        const itemPath = path.join(projectRoot, item);
        await removeItem(itemPath, item);
    }
    
    console.log('\n📁 Ensuring required directories exist:');
    for (const dir of requiredDirectories) {
        const dirPath = path.join(projectRoot, dir);
        await ensureDirectory(dirPath, dir);
    }
    
    console.log('\n📊 Current project structure:');
    await listProjectStructure();
    
    console.log('\n✅ Cleanup completed!');
    console.log('\n🎯 Project is now clean and organized:');
    console.log('   - All crawler scripts in Scripts/ directory');
    console.log('   - Results stored in Results/ directory'); 
    console.log('   - Main CLI runner: crawl.js');
    console.log('   - Docker Compose: docker-compose.yml');
    console.log('   - Setup script: setup.ps1');
}

async function listProjectStructure() {
    try {
        const items = await fs.readdir(projectRoot);
        const structure = [];
        
        for (const item of items.sort()) {
            if (item.startsWith('.') || item === 'node_modules') continue;
            
            const itemPath = path.join(projectRoot, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
                const subItems = await fs.readdir(itemPath);
                structure.push(`📁 ${item}/ (${subItems.length} items)`);
            } else {
                const sizeKB = Math.round(stats.size / 1024);
                structure.push(`📄 ${item} (${sizeKB}KB)`);
            }
        }
        
        structure.forEach(item => console.log(`   ${item}`));
    } catch (error) {
        console.log(`⚠️ Could not list project structure: ${error.message}`);
    }
}

// Run cleanup
cleanup().catch(console.error);
