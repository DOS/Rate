/**
 * Bank utilities for Vietnamese bank validation
 */

interface BankInfo {
  name: string;
  code: string;
}

const bankMappings: Record<string, BankInfo> = {
  // Vietcombank
  'vietcombank': { name: 'Vietcombank', code: 'VCB' },
  'vcb': { name: 'Vietcombank', code: 'VCB' },
  'ngan hang ngoai thuong': { name: 'Vietcombank', code: 'VCB' },
  
  // Techcombank
  'techcombank': { name: 'Techcombank', code: 'TCB' },
  'tcb': { name: 'Techcombank', code: 'TCB' },
  'ngan hang ky thuong': { name: 'Techcombank', code: 'TCB' },
  
  // BIDV
  'bidv': { name: 'BIDV', code: 'BIDV' },
  'ngan hang dau tu va phat trien': { name: 'BIDV', code: 'BIDV' },
  
  // Vietinbank
  'vietinbank': { name: 'Vietinbank', code: 'CTG' },
  'ctg': { name: 'Vietinbank', code: 'CTG' },
  'ngan hang cong thuong': { name: 'Vietinbank', code: 'CTG' },
  
  // MB Bank
  'mbbank': { name: 'MB Bank', code: 'MB' },
  'mb': { name: 'MB Bank', code: 'MB' },
  'ngan hang quan doi': { name: 'MB Bank', code: 'MB' },
  
  // Sacombank
  'sacombank': { name: 'Sacombank', code: 'STB' },
  'stb': { name: 'Sacombank', code: 'STB' },
  
  // ACB
  'acb': { name: 'ACB', code: 'ACB' },
  'ngan hang a chau': { name: 'ACB', code: 'ACB' },
  
  // TPBank
  'tpbank': { name: 'TPBank', code: 'TPB' },
  'tpb': { name: 'TPBank', code: 'TPB' },
  'tien phong bank': { name: 'TPBank', code: 'TPB' },
  
  // VPBank
  'vpbank': { name: 'VPBank', code: 'VPB' },
  'vpb': { name: 'VPBank', code: 'VPB' },
  'ngan hang viet nam thinh vuong': { name: 'VPBank', code: 'VPB' },
  
  // Agribank
  'agribank': { name: 'Agribank', code: 'VBA' },
  'vba': { name: 'Agribank', code: 'VBA' },
  'ngan hang nong nghiep': { name: 'Agribank', code: 'VBA' },
  
  // OCB
  'ocb': { name: 'OCB', code: 'OCB' },
  'ngan hang phuong dong': { name: 'OCB', code: 'OCB' },
  
  // SHB
  'shb': { name: 'SHB', code: 'SHB' },
  'ngan hang sai gon ha noi': { name: 'SHB', code: 'SHB' },
  
  // HDBank
  'hdbank': { name: 'HDBank', code: 'HDB' },
  'hdb': { name: 'HDBank', code: 'HDB' },
  
  // VIB
  'vib': { name: 'VIB', code: 'VIB' },
  'ngan hang quoc te': { name: 'VIB', code: 'VIB' },
  
  // MSB
  'msb': { name: 'MSB', code: 'MSB' },
  'maritime bank': { name: 'MSB', code: 'MSB' },
  
  // SeABank
  'seabank': { name: 'SeABank', code: 'SSB' },
  'ssb': { name: 'SeABank', code: 'SSB' },
  'ngan hang dong nam a': { name: 'SeABank', code: 'SSB' },
  
  // LienVietPostBank
  'lienvietpostbank': { name: 'LienVietPostBank', code: 'LPB' },
  'lpb': { name: 'LienVietPostBank', code: 'LPB' },
  'lien viet post bank': { name: 'LienVietPostBank', code: 'LPB' },
  
  // BacA Bank
  'bacabank': { name: 'BacA Bank', code: 'BAB' },
  'bab': { name: 'BacA Bank', code: 'BAB' },
  'bac a bank': { name: 'BacA Bank', code: 'BAB' },
  
  // Kienlongbank
  'kienlongbank': { name: 'Kienlongbank', code: 'KLB' },
  'klb': { name: 'Kienlongbank', code: 'KLB' },
  'kien long bank': { name: 'Kienlongbank', code: 'KLB' },
  
  // VietABank
  'vietabank': { name: 'VietABank', code: 'VAB' },
  'vab': { name: 'VietABank', code: 'VAB' },
  'viet a bank': { name: 'VietABank', code: 'VAB' },
  
  // Nam A Bank
  'namabank': { name: 'Nam A Bank', code: 'NAB' },
  'nab': { name: 'Nam A Bank', code: 'NAB' },
  'nam a bank': { name: 'Nam A Bank', code: 'NAB' },
  
  // PGBank
  'pgbank': { name: 'PGBank', code: 'PGB' },
  'pgb': { name: 'PGBank', code: 'PGB' },
  'petrolimex bank': { name: 'PGBank', code: 'PGB' },
  
  // GPBank
  'gpbank': { name: 'GPBank', code: 'GPB' },
  'gpb': { name: 'GPBank', code: 'GPB' },
  
  // VietCapital Bank
  'vietcapitalbank': { name: 'VietCapital Bank', code: 'BVB' },
  'bvb': { name: 'VietCapital Bank', code: 'BVB' },
  'viet capital bank': { name: 'VietCapital Bank', code: 'BVB' },
  
  // Bao Viet Bank
  'baovietbank': { name: 'Bao Viet Bank', code: 'BAOVIET' },
  'bao viet bank': { name: 'Bao Viet Bank', code: 'BAOVIET' },
  
  // DongA Bank
  'dongabank': { name: 'DongA Bank', code: 'DAB' },
  'dab': { name: 'DongA Bank', code: 'DAB' },
  'dong a bank': { name: 'DongA Bank', code: 'DAB' },
  
  // CB Bank
  'cbbank': { name: 'CB Bank', code: 'CBB' },
  'cbb': { name: 'CB Bank', code: 'CBB' },
  
  // ABBank
  'abbank': { name: 'ABBank', code: 'ABB' },
  'abb': { name: 'ABBank', code: 'ABB' },
  'an binh bank': { name: 'ABBank', code: 'ABB' },
  
  // NCB
  'ncb': { name: 'NCB', code: 'NCB' },
  'ngan hang quoc dan': { name: 'NCB', code: 'NCB' },
  
  // Ocean Bank
  'oceanbank': { name: 'Ocean Bank', code: 'OJB' },
  'ojb': { name: 'Ocean Bank', code: 'OJB' },
  'ocean bank': { name: 'Ocean Bank', code: 'OJB' }
};

export function normalizeBank(bankName: string): BankInfo {
  // Clean and normalize bank name
  const cleaned = bankName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '');
  
  // Check direct mapping
  if (bankMappings[cleaned]) {
    return bankMappings[cleaned];
  }
  
  // Check if contains bank code or name
  for (const [key, info] of Object.entries(bankMappings)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return info;
    }
  }
  
  // Return original if not found
  return {
    name: bankName,
    code: bankName.toUpperCase().substring(0, 3)
  };
}

export function isValidBankAccount(accountNumber: string): boolean {
  // Remove all non-digit characters
  const cleaned = accountNumber.replace(/\D/g, '');
  
  // Vietnamese bank accounts are typically 9-19 digits
  return cleaned.length >= 9 && cleaned.length <= 19;
}

export function formatBankAccount(accountNumber: string): string {
  // Remove all non-digit characters
  const cleaned = accountNumber.replace(/\D/g, '');
  
  // Format with spaces every 4 digits
  return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
} 