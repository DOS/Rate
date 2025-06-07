/**
 * Verify all extension files are ready
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Rate Crawler Extension files...\n');

const requiredFiles = [
  'manifest.json',
  'background.js',
  'content_script.js',
  'popup.html',
  'popup.js',
  'extension-adapter.js',
  'core-validator-v1.js',
  'data-validator.js'
];

const results = {
  found: [],
  missing: []
};

// Check each file
requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    results.found.push({
      file: file,
      size: stats.size,
      modified: stats.mtime
    });
  } else {
    results.missing.push(file);
  }
});

// Display results
console.log(`✅ Found ${results.found.length} files:`);
results.found.forEach(item => {
  console.log(`   - ${item.file} (${item.size} bytes)`);
});

if (results.missing.length > 0) {
  console.log(`\n❌ Missing ${results.missing.length} files:`);
  results.missing.forEach(file => {
    console.log(`   - ${file}`);
  });
}

// Check manifest.json validity
console.log('\n📋 Checking manifest.json...');
try {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Manifest Version: ${manifest.manifest_version}`);
  
  // Check permissions
  if (manifest.permissions) {
    console.log(`   Permissions: ${manifest.permissions.join(', ')}`);
  }
  
  // Check if service worker is defined
  if (manifest.background?.service_worker) {
    console.log(`   ✅ Service worker: ${manifest.background.service_worker}`);
  } else {
    console.log(`   ❌ No service worker defined`);
  }
  
} catch (error) {
  console.log(`   ❌ Invalid JSON: ${error.message}`);
}

// Check for test files
console.log('\n🧪 Test files:');
const testFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('test-'));
testFiles.forEach(file => {
  console.log(`   - ${file}`);
});

// Summary
console.log('\n📊 Summary:');
if (results.missing.length === 0) {
  console.log('   ✅ All required files present');
  console.log('   ✅ Extension ready to load in Chrome');
  console.log('\n🚀 Next steps:');
  console.log('   1. Open Chrome and go to chrome://extensions/');
  console.log('   2. Enable "Developer mode"');
  console.log('   3. Click "Load unpacked"');
  console.log(`   4. Select folder: ${__dirname}`);
} else {
  console.log('   ❌ Some files are missing');
  console.log('   Please create missing files before loading extension');
}
