// Test FlareSolverr fetch HTML for checkscam.vn main scam list page
import fetch from 'node-fetch';

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const TARGET_URL = process.argv[2] || 'https://checkscam.vn/category/danh-sanh-scam/';

async function main() {
  const res = await fetch(FLARESOLVERR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cmd: 'request.get',
      url: TARGET_URL,
      maxTimeout: 45000
    })
  });
  const data = await res.json();
  if (data.status === 'ok') {
    const html = data.solution.response;
    console.log('=== HTML HEAD (first 1000 chars) ===');
    console.log(html.slice(0, 1000));
    console.log('=== ... ===');
    // In ra toàn bộ đoạn <div class="pst">...</div>
    const pstMatch = html.match(/<div class="pst">([\s\S]*?)<\/div>/);
    if (pstMatch) {
      console.log('\n=== <div class="pst"> CONTENT ===');
      console.log(pstMatch[1].slice(0, 1500));
      console.log('=== ... ===');
    } else {
      console.log('\nKhông tìm thấy <div class="pst"> trong HTML!');
    }
    // Extract scam profile links theo <div class="ct1"><a href="...">
    const matches = [...html.matchAll(/<div class=\"ct1\">\s*<a href=\"([^\"]+)\">/g)];
    if (matches.length) {
      console.log(`\nFound ${matches.length} <div class="ct1"><a ...> links:`);
      matches.forEach((m, i) => console.log(`#${i+1}: ${m[1]}`));
    } else {
      console.log('\nNo <div class="ct1"><a ...> links found!');
    }
  } else {
    console.error('FlareSolverr error:', data);
  }
}

main().catch(e => {
  console.error('Script error:', e);
  process.exit(1);
});
