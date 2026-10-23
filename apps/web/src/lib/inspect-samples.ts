/**
 * Sample links on /inspect. The first one is inspected when the page opens
 * without ?q=; the page computes that result on the server so it renders in
 * place instead of growing after hydration (DOS/Rate#763).
 */
export const SAMPLE_AUDIT_URLS = [
  {
    label: 'iPhone 16 128GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-128GB-i.88201679.27110898667',
  },
  {
    label: 'iPhone 16 Plus 256GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-16-Plus-256GB-i.88201679.29410893286',
  },
  {
    label: 'iPhone 15 128GB (Shopee Mall)',
    query:
      'https://shopee.vn/Điện-thoại-Apple-iPhone-15-128GB-i.88201679.18093055535',
  },
  {
    label: 'Apple Flagship Store (88201679)',
    query: 'https://shopee.vn/shop/88201679',
  },
];
