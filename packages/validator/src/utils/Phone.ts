/**
 * Phone number utilities for Vietnamese phone validation
 */

export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove country code if present
  if (cleaned.startsWith('84')) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('0084')) {
    cleaned = '0' + cleaned.substring(4);
  }
  
  // Ensure starts with 0
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

export function getCarrier(phone: string): string | null {
  const normalized = normalizePhone(phone);
  
  if (normalized.length < 3) return null;
  
  const prefix = normalized.substring(0, 3);
  
  // Viettel
  if (['032', '033', '034', '035', '036', '037', '038', '039'].includes(prefix) ||
      ['070', '076', '077', '078', '079'].includes(prefix) ||
      ['086', '096', '097', '098'].includes(prefix)) {
    return 'Viettel';
  }
  
  // Vinaphone
  if (['081', '082', '083', '084', '085'].includes(prefix) ||
      ['088', '091', '094'].includes(prefix)) {
    return 'Vinaphone';
  }
  
  // MobiFone
  if (['089', '090', '093'].includes(prefix)) {
    return 'MobiFone';
  }
  
  // Vietnamobile
  if (['056', '058', '092'].includes(prefix)) {
    return 'Vietnamobile';
  }
  
  // Gmobile
  if (['059', '099'].includes(prefix)) {
    return 'Gmobile';
  }
  
  return 'Unknown';
}

export function isValidVietnamesePhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  
  // Check length
  if (normalized.length !== 10) return false;
  
  // Check format
  const vietnamPhoneRegex = /^0[3|5|7|8|9][0-9]{8}$/;
  return vietnamPhoneRegex.test(normalized);
} 