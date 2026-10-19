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

  // Neutralize formula-injection payloads starting with =, +, -, @, |, \t, \r
  // (including payloads with leading whitespace/newlines before =, +, -, @, |)
  // unless the string is a plain numeric literal like "-15.4" or "+12"
  const trimmed = str.trim();
  const isPlainNumericLiteral = /^[+-]?\d+(?:\.\d+)?%?$/.test(trimmed);
  if (
    !isPlainNumericLiteral &&
    (/^[=+\-@\t\r|]/.test(str) || /^[=+\-@|]/.test(trimmed))
  ) {
    str = `'${str}`;
  }

  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a UTF-8 BOM CSV string from headers and rows with formula-injection protection.
 */
export function buildSafeCsvContent(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
  lineEnding: '\n' | '\r\n' = '\r\n'
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${[headerLine, ...rowLines].join(lineEnding)}`;
}
