const MAX_CSV_CELL_LENGTH = 10_000;
const MAX_CSV_COLUMNS = 200;
const MAX_CSV_ROWS = 10_000;

/**
 * Shared CSV cell escaper that neutralizes spreadsheet formula injection (CSV/Excel DDE)
 * while preserving numeric values (including negative numbers).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  let rawStr: string;
  if (typeof value === 'string') {
    rawStr = value;
  } else if (typeof value === 'boolean' || typeof value === 'bigint') {
    rawStr = String(value);
  } else if (value instanceof Date) {
    rawStr = Number.isFinite(value.getTime()) ? value.toISOString() : '';
  } else {
    return '';
  }

  let str = rawStr
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\P{Cc}\n\t]+/gu, '');
  if (str.length > MAX_CSV_CELL_LENGTH) {
    str = str.slice(0, MAX_CSV_CELL_LENGTH);
  }

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
  const safeLineEnding = lineEnding === '\n' ? '\n' : '\r\n';
  const safeHeaders = Array.isArray(headers)
    ? headers.slice(0, MAX_CSV_COLUMNS)
    : [];
  const safeRows = Array.isArray(rows) ? rows.slice(0, MAX_CSV_ROWS) : [];
  const headerLine = safeHeaders.map(escapeCsvCell).join(',');
  const rowLines = safeRows.map((row) =>
    (Array.isArray(row) ? row.slice(0, MAX_CSV_COLUMNS) : [])
      .map(escapeCsvCell)
      .join(',')
  );
  return `\uFEFF${[headerLine, ...rowLines].join(safeLineEnding)}`;
}
