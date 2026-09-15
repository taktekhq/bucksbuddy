import { describe, it, expect, vi } from "vitest";
import { readAllPages } from "@/lib/pagedRead";

// Small pages, so the two answers that matter — a failed page and a read that
// runs out of pages — are reachable without a quarter of a million rows. In the
// store these are 500 and 500.
const SMALL = { pageSize: 2, maxPages: 3 };

/** Pages served from a fixed list, recording the ranges it was asked for. */
function source(items: number[]) {
  const asked: [number, number][] = [];
  const fetchPage = vi.fn(async (from: number, to: number) => {
    asked.push([from, to]);
    return items.slice(from, to + 1);
  });
  return { fetchPage, asked };
}

describe("readAllPages", () => {
  it("reads until a short page says that was the end", async () => {
    const { fetchPage, asked } = source([1, 2, 3]);
    expect(await readAllPages(fetchPage, SMALL)).toEqual([1, 2, 3]);
    // Two requests: a full page, then a short one. It does not ask again.
    expect(asked).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("treats an empty page as the end when the window divides exactly", async () => {
    const { fetchPage, asked } = source([1, 2]);
    expect(await readAllPages(fetchPage, SMALL)).toEqual([1, 2]);
    expect(asked).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("reads nothing at all without complaining", async () => {
    const { fetchPage } = source([]);
    expect(await readAllPages(fetchPage, SMALL)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns null when a page fails, rather than what it had so far", async () => {
    // The whole reason this exists: a truncated read that looks complete is
    // worse than no read, because everything downstream trusts it.
    const fetchPage = vi.fn(async (from: number) => (from === 0 ? [1, 2] : null));
    expect(await readAllPages(fetchPage, SMALL)).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("returns null when it runs out of pages with the last one still full", async () => {
    // Six items, three pages of two: the cap is reached with more to come.
    const { fetchPage } = source([1, 2, 3, 4, 5, 6]);
    expect(await readAllPages(fetchPage, SMALL)).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("stops at the cap even when the source is endless", async () => {
    const fetchPage = vi.fn(async () => [1, 2]);
    expect(await readAllPages(fetchPage, { pageSize: 2, maxPages: 5 })).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(5);
  });
});
