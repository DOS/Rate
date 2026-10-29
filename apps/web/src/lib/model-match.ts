/**
 * Ranks catalogue search candidates against a listing title or a keyword, so
 * a lookup picks the model the title names and not one that only contains it:
 * "Apple iPhone 16 128GB" is the iPhone 16, not the 16e or the 16 Plus, and
 * "iPhone 16e" is never the iPhone 16 (DOS/Rate#1379, #594).
 *
 * The catalogue search returns every model whose text contains the query,
 * newest first, so the first row is not the best match.
 */

/** Words that make a different model when added to a model name. */
const MODEL_SUFFIXES = new Set([
  'plus',
  'pro',
  'max',
  'ultra',
  'mini',
  'fe',
  'lite',
  'air',
  'se',
  'fold',
  'flip',
  'neo',
  'edge',
  'slim',
]);

/**
 * Storage, RAM and screen sizes (the variant, not the model) and network
 * generations, which say nothing about the model. "14T" is a model, "1T" a
 * size.
 */
const SIZE_TOKEN =
  /^(\d+(gb|tb|mm|inch)|[345]g|(8|16|32|64|128|256|512)g|[12]t)$/;

/** Letters glued to a model number ("16e", "14T", "13C") make a model. */
const GLUED_MARK = '~';

function isSuffix(token: string): boolean {
  return (
    MODEL_SUFFIXES.has(token) ||
    token.startsWith(GLUED_MARK) ||
    /^[a-z]$/.test(token)
  );
}

export function modelTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !SIZE_TOKEN.test(t))
    .flatMap((t) => {
      const m = t.match(/^(\d+)([a-z]+)$/);
      if (!m) return [t];
      const number = m[1]!;
      const letters = m[2]!;
      if (MODEL_SUFFIXES.has(letters)) return [number, letters];
      return letters.length <= 2 ? [number, `${GLUED_MARK}${letters}`] : [t];
    });
}

export interface ModelCandidate {
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  storage_gb?: number | null;
}

function candidateTokens(candidate: ModelCandidate): Set<string> {
  return new Set(
    modelTokens(
      [candidate.brand, candidate.model, candidate.name]
        .filter((s): s is string => typeof s === 'string')
        .join(' ')
    )
  );
}

/**
 * The candidates, best match first. A candidate is worse the more model
 * suffixes it has that the query does not (16 Plus, 16e for "iPhone 16") and
 * the more of the query's model suffixes it lacks (16 for "iPhone 16e"); a
 * matching storage size breaks ties between sizes of the best model; otherwise
 * the search order is kept. Callers rank the cleaned title the search used,
 * without bracketed promotions ("Tặng ốp lưng Pro").
 */
export function rankModelCandidates<T extends ModelCandidate>(
  query: string,
  candidates: readonly T[],
  storageGb?: number | null
): T[] {
  const queryTokens = new Set(modelTokens(query));
  const querySuffixes = [...queryTokens].filter(isSuffix);
  return candidates
    .map((candidate, index) => {
      const tokens = candidateTokens(candidate);
      const extraSuffixes = [...tokens].filter(
        (t) => isSuffix(t) && !queryTokens.has(t)
      ).length;
      const missingSuffixes = querySuffixes.filter(
        (t) => !tokens.has(t)
      ).length;
      const storageMiss =
        storageGb && candidate.storage_gb !== storageGb ? 1 : 0;
      return {
        candidate,
        index,
        mismatch: extraSuffixes + missingSuffixes,
        storageMiss,
      };
    })
    .sort(
      (a, b) =>
        a.mismatch - b.mismatch ||
        a.storageMiss - b.storageMiss ||
        a.index - b.index
    )
    .map((r) => r.candidate);
}
