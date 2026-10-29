/**
 * Ranks catalogue search candidates against a listing title or a keyword, so
 * a lookup picks the model the title names and not one that only contains it:
 * "Apple iPhone 16 128GB" is the iPhone 16, not the 16e or the 16 Plus, and
 * "iPhone 16e" is never the iPhone 16 (DOS/Rate#1379, #594).
 *
 * The catalogue search returns every model whose text contains the query, in
 * no particular order, so the first row is not the best match.
 */

/** Words that make a different model when added after a model name. */
const MODEL_SUFFIXES = new Set([
  'e',
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

/** Storage, RAM and other size tokens: the variant, not the model. */
const SIZE_TOKEN = /^\d+(gb|tb|g|t|mm|inch)$/;

export function modelTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !SIZE_TOKEN.test(t))
      // A lone "e" is noise ("e-SIM"); the 16e's "e" comes from "16e" below.
      .filter((t) => t !== 'e')
      .flatMap((t) => {
        // "16e" names the 16e: split a number from a trailing model suffix.
        const m = t.match(/^(\d+)([a-z]+)$/);
        return m && MODEL_SUFFIXES.has(m[2]!) ? [m[1]!, m[2]!] : [t];
      })
  );
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
 * matching storage size breaks ties; otherwise the search order is kept.
 */
export function rankModelCandidates<T extends ModelCandidate>(
  query: string,
  candidates: readonly T[],
  storageGb?: number | null
): T[] {
  const queryTokens = new Set(modelTokens(query));
  const querySuffixes = [...queryTokens].filter((t) => MODEL_SUFFIXES.has(t));
  return candidates
    .map((candidate, index) => {
      const tokens = candidateTokens(candidate);
      const extraSuffixes = [...tokens].filter(
        (t) => MODEL_SUFFIXES.has(t) && !queryTokens.has(t)
      ).length;
      const missingSuffixes = querySuffixes.filter(
        (t) => !tokens.has(t)
      ).length;
      const storageMiss =
        storageGb && candidate.storage_gb !== storageGb ? 1 : 0;
      return { candidate, index, extraSuffixes, missingSuffixes, storageMiss };
    })
    .sort(
      (a, b) =>
        a.missingSuffixes +
          a.extraSuffixes -
          (b.missingSuffixes + b.extraSuffixes) ||
        a.storageMiss - b.storageMiss ||
        a.index - b.index
    )
    .map((r) => r.candidate);
}
