// Test FlareSolverr fetch HTML for a single checkscam.vn profile
import fetch from 'node-fetch';

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
const TARGET_URL = process.argv[2] || 'https://checkscam.vn/nguyen-thi-kieu-trinh-5/';

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
    console.log('=== HTML HEAD (first 800 chars) ===');
    console.log(html.slice(0, 800));
    console.log('=== ... ===');
  } else {
    console.error('FlareSolverr error:', data);
  }
}

main().catch(e => {
  console.error('Script error:', e);
  process.exit(1);
});
