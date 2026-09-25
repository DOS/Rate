import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();
  
  console.log('Navigating to product...');
  await page.goto('https://shopee.vn/product-i.268182642.13147522818', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title());
  
  const textSnippet = await page.evaluate(() => {
    return document.body.innerText.slice(0, 500).replace(/\n+/g, ' | ');
  });
  console.log('Page Text Snippet:', textSnippet);

  console.log('Scrolling down to ratings container...');
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(800);
  }

  const domReviews = await page.evaluate(() => {
    // Find all review cards
    const ratingCards = Array.from(document.querySelectorAll('.shopee-product-rating'));
    const list = ratingCards.map(card => {
      const author = card.querySelector('.shopee-product-rating__author-name')?.textContent?.trim() || '';
      const timeAndModel = card.querySelector('.shopee-product-rating__time')?.textContent?.trim() || '';
      const comment = card.querySelector('div[style*="pre-wrap"]')?.textContent?.trim() || 
                      card.querySelector('.shopee-product-rating__main')?.textContent?.trim() || '';
      const stars = card.querySelectorAll('.icon-rating-solid--active, svg.icon-rating-solid').length;
      
      const images = Array.from(card.querySelectorAll('.shopee-rating-image-list__image-wrapper img'))
        .map(img => (img as HTMLImageElement).src)
        .filter(Boolean);

      return {
        author,
        stars: stars || 5,
        timeAndModel,
        comment,
        imagesCount: images.length,
      };
    });

    return {
      cardCount: ratingCards.length,
      sampleReviews: list.slice(0, 5),
    };
  });

  console.log('\nDOM Reviews Extraction Result:');
  console.log(`Review Cards Found in DOM: ${domReviews.cardCount}`);
  if (domReviews.sampleReviews.length > 0) {
    console.log('\nSample DOM Reviews:');
    domReviews.sampleReviews.forEach((r, idx) => {
      console.log(`[Review ${idx + 1}] (${r.stars}★) ${r.author} [${r.timeAndModel}]:`);
      console.log(`  "${r.comment}" (Images: ${r.imagesCount})`);
    });
  }

  await page.close();
}

test().catch(console.error);
