import { expect, test } from '@playwright/test';

// Lazy size panels on an Item with many sizes (DOS/Rate#1285): the six-size Item in
// seed.sql renders only its default size on the server and loads the others when
// picked; the two-size Item still renders both. The RSC payload sizes are logged as
// test annotations, so the CI report records them.
const BIG = '/smartphones/e2e-item-big';
const SMALL = '/smartphones/e2e-item-phone';
const listing = (gb: number, l: number) => `E2E Item Big ${gb}GB listing ${l}`;

const rscBytes = async (
  request: import('@playwright/test').APIRequestContext,
  path: string
) => {
  const res = await request.get(path, { headers: { RSC: '1' } });
  expect(res.status(), path).toBe(200);
  return (await res.text()).length;
};

test('a six-size Item ships only its default size and loads the others on demand', async ({
  page,
  request,
}, testInfo) => {
  const big = await rscBytes(request, BIG);
  const small = await rscBytes(request, SMALL);
  testInfo.annotations.push(
    { type: 'rsc-bytes six-size Item (lazy)', description: String(big) },
    { type: 'rsc-bytes two-size Item (eager)', description: String(small) }
  );
  // What the five other sizes' panel data would have added, from the size route.
  let others = 0;
  for (const gb of [128, 256, 512, 1024, 2048]) {
    const res = await request.get(
      `/api/v1/rate/item-size/e2e-item-big-${gb}gb`
    );
    expect(res.status(), `${gb}GB`).toBe(200);
    others += (await res.text()).length;
  }
  testInfo.annotations.push({
    type: 'size-route json bytes, five other sizes',
    description: String(others),
  });
  // Printed too, so the CI log carries the numbers (the line reporter does not
  // print annotations).
  console.log(
    `[#1285] RSC bytes: six-size Item (lazy) ${big}, two-size Item (eager) ${small}; size-route JSON bytes for the five other sizes ${others}`
  );

  const html = await (await request.get(BIG)).text();
  expect(html).toContain(listing(64, 1));
  expect(html, 'no other size is server-rendered').not.toContain(
    listing(256, 1)
  );

  await page.goto(`${BIG}?v=256gb`);
  await expect(page.getByText(listing(256, 1)).first()).toBeVisible();
  await expect(page.getByText(listing(64, 1))).toHaveCount(0);
});

test('a two-size Item still renders both sizes on the server', async ({
  request,
}) => {
  const html = await (await request.get(SMALL)).text();
  expect(html).toContain('E2E Item Phone 128GB');
  expect(html).toContain('E2E Item Phone 256GB');
});
