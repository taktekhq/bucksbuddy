import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchGoldUsdPerGram, formatGrams } from "@/lib/gold";

const TROY_OUNCE_IN_GRAMS = 31.1034768;

describe("formatGrams", () => {
  it("formats grams with up to 3 decimals", () => {
    expect(formatGrams(5)).toBe("5 g");
    expect(formatGrams(2.5)).toBe("2.5 g");
    expect(formatGrams(0.125)).toBe("0.125 g");
  });
});

describe("fetchGoldUsdPerGram", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns USD per gram on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ price: 3110.34768 }),
      })),
    );
    const perGram = await fetchGoldUsdPerGram();
    expect(perGram).toBeCloseTo(3110.34768 / TROY_OUNCE_IN_GRAMS, 6);
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect(await fetchGoldUsdPerGram()).toBeNull();
  });

  it("returns null when the price is missing or non-positive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ price: 0 }) })),
    );
    expect(await fetchGoldUsdPerGram()).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    expect(await fetchGoldUsdPerGram()).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await fetchGoldUsdPerGram()).toBeNull();
  });

  it("aborts and returns null when the request times out", async () => {
    vi.useFakeTimers();
    // fetch that only rejects once its abort signal fires.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const promise = fetchGoldUsdPerGram();
    await vi.advanceTimersByTimeAsync(8000); // trips the abort timeout
    expect(await promise).toBeNull();
  });
});
