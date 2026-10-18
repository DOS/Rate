/**
 * Reads every row of a query in pages. One PostgREST response stops at the
 * project's max-rows (1000 on Supabase) without an error, so full-table reads
 * in jobs must page. Pages advance by the rows actually returned, which also
 * works if max-rows is lowered; the query must have a deterministic order.
 */
export async function fetchAllPages<T>(
  label: string,
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
  }
}
