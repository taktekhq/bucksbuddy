// Read every page of something, or admit that you could not.
//
// Pulled out of the store so the two answers that are easy to get wrong are
// testable without 250,000 rows: a page that fails, and a read that runs out of
// pages. Both return null. A short page — fewer rows than asked for — is the
// only thing that means "that was the end".
//
// The caller's `fetchPage` does its own work per page (the store decrypts there),
// so peak memory is one page of ciphertext rather than the whole window twice.

export async function readAllPages<T>(
  /** Fetch one page by offset range, or null if the page could not be read. */
  fetchPage: (from: number, to: number) => Promise<T[] | null>,
  { pageSize, maxPages }: { pageSize: number; maxPages: number },
): Promise<T[] | null> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(page * pageSize, page * pageSize + pageSize - 1);
    // A failed page must not read as the end: that would silently truncate
    // whatever is computed from the result.
    if (batch === null) return null;
    all.push(...batch);
    if (batch.length < pageSize) return all;
  }
  // Out of pages with the last one still full, so there is more we have not
  // read. Returning what we have would be a partial answer wearing a complete
  // one's clothes.
  return null;
}
