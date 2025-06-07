// Scripts/crawl-url-with-flaresolverr.cjs
// Crawl bất kỳ URL nào qua FlareSolverr và lưu HTML trả về (CommonJS)
const axios = require('axios');
const fs = require('fs');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node crawl-url-with-flaresolverr.cjs <url>');
  process.exit(1);
}

async function main() {
  try {
    console.log(`🚀 Crawling via FlareSolverr: ${url}`);
    const resp = await axios.post('http://localhost:8191/v1', {
      cmd: 'request.get',
      url: url,
      maxTimeout: 60000
    });
    if (resp.data && resp.data.solution && resp.data.solution.response) {
      const fname = `result_${Date.now()}.html`;
      fs.writeFileSync(fname, resp.data.solution.response, 'utf8');
      console.log(`✅ HTML saved to ${fname}`);
    } else {
      console.error('❌ Failed to get HTML');
      process.exit(2);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(3);
  }
}

main();
