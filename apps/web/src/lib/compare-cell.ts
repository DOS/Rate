/**
 * Compare matrix cells mix catalogue text ("Paměťová karta: ", "Barvy: ",
 * " | ") with spec values from the source data. A row marks each spec value
 * with specPart, so the cell can mark that part's language and leave the
 * page's own text alone (DOS/Rate#1392). Everything else reads the plain
 * text through plainCompareCell.
 */

// Private-use characters: never in catalogue text or spec data.
const OPEN = '\uE000';
const CLOSE = '\uE001';

/** A spec value marked as such; empty values and "-" stay as they are. */
export function specPart(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  if (value === '' || value === '-' || value.includes(OPEN)) return value;
  return `${OPEN}${value}${CLOSE}`;
}

/** The cell as text, without the marks. */
export function plainCompareCell(cell: string): string {
  return cell.split(OPEN).join('').split(CLOSE).join('');
}

export interface CompareCellSegment {
  text: string;
  /** A spec value from the source data, not catalogue text. */
  spec: boolean;
}

/** The cell split into catalogue text and marked spec values, in order. */
export function compareCellSegments(cell: string): CompareCellSegment[] {
  const segments: CompareCellSegment[] = [];
  let rest = cell;
  while (rest.length > 0) {
    const open = rest.indexOf(OPEN);
    if (open < 0) {
      segments.push({ text: rest, spec: false });
      break;
    }
    if (open > 0) segments.push({ text: rest.slice(0, open), spec: false });
    const close = rest.indexOf(CLOSE, open + 1);
    if (close < 0) {
      segments.push({ text: rest.slice(open + 1), spec: true });
      break;
    }
    segments.push({ text: rest.slice(open + 1, close), spec: true });
    rest = rest.slice(close + 1);
  }
  return segments.filter((s) => s.text.length > 0);
}
