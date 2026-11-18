// PostgREST caps individual responses. Keep topic progress accurate for large schools.
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error) throw new Error("Could not load learning progress. Please try again.");
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}
