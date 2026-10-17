/**
 * Shared CSV cell escaper that neutralizes spreadsheet formula injection (CSV/Excel DDE)
 * while preserving numeric values (including negative numbers).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  let str = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Neutralize formula-injection payloads starting with =, +, -, @, \t, \r
  // unless the string is a plain numeric literal like "-15.4" or "+12"
  if (/^[=+\-@\t\r]/.test(str) && !/^[+-]?\d+(?:\.\d+)?%?$/.test(str.trim())) {
    str = `'${str}`;
  }

  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
