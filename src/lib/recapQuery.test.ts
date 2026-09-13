import { beforeEach, expect, it, vi } from "vitest";
import { recapRow } from "@/test/recapFixture";
import { fetchRecapMonth } from "./recapQuery";
import type { TransactionRow } from "@/types/db";
const { query, page, from } = vi.hoisted(() => {
  const page = vi.fn();
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    abortSignal: vi.fn(),
  };
  return { query, page, from: vi.fn() };
});
vi.mock("./supabase", () => ({ supabase: { from } }));
const decrypt = vi.fn(async (row: TransactionRow) => recapRow(row.id));
const month = new Date(2025, 11, 1);
const load = (signal = new AbortController().signal) =>
  fetchRecapMonth("user", month, decrypt, signal);
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(query)) fn.mockReturnValue(query);
  query.abortSignal.mockImplementation(page);
  from.mockReturnValue(query);
  page.mockReset();
  decrypt.mockImplementation(async (row) => recapRow(row.id));
});
it("queries and decrypts a complete old month over 500 rows with stable order and local boundaries", async () => {
  page
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, id) => recapRow(String(id))),
      count: 503,
    })
    .mockResolvedValueOnce({
      data: [recapRow("500"), recapRow("501"), recapRow("502")],
      count: 503,
    });
  expect(await load()).toHaveLength(503);
  expect(query.range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
  ]);
  expect(query.order.mock.calls.slice(0, 2)).toEqual([
    ["occurred_at", { ascending: true }],
    ["id", { ascending: true }],
  ]);
  expect(query.eq).toHaveBeenCalledWith("user_id", "user");
  expect(query.gte).toHaveBeenCalledWith("occurred_at", month.toISOString());
  expect(query.lt).toHaveBeenCalledWith(
    "occurred_at",
    new Date(2026, 0, 1).toISOString(),
  );
  expect(decrypt).toHaveBeenCalledTimes(503);
});
it("continues below server page caps and deduplicates repeated IDs", async () => {
  page
    .mockResolvedValueOnce({ data: [recapRow("a")], count: 2 })
    .mockResolvedValueOnce({ data: [recapRow("a"), recapRow("b")], count: 2 });
  expect(await load()).toHaveLength(2);
  expect(query.range).toHaveBeenLastCalledWith(1, 500);
  expect(decrypt).toHaveBeenCalledTimes(2);
});
it("allows a provably empty month", async () => {
  page.mockResolvedValue({ data: [], count: 0 });
  expect(await load()).toEqual([]);
});
it.each([
  [{ data: null, count: 0 }],
  [{ data: [], count: null }],
  [{ data: [], count: 1 }],
  [{ data: [], count: 0, error: {} }],
  [
    { data: [recapRow("a")], count: 2 },
    { data: [recapRow("b")], count: 3 },
  ],
  [{ data: [recapRow("a"), recapRow("a")], count: 2 }],
])("rejects partial or inconsistent queries %#", async (...pages) => {
  for (const value of pages) page.mockResolvedValueOnce(value);
  await expect(load()).rejects.toThrow("incomplete_query");
});
it("rejects decryption and network errors", async () => {
  page.mockResolvedValue({ data: [recapRow("a")], count: 1 });
  decrypt.mockRejectedValueOnce(new Error("decrypt"));
  await expect(load()).rejects.toThrow("decrypt");
  page.mockRejectedValueOnce(new Error("offline"));
  await expect(load()).rejects.toThrow("offline");
});
it("aborts before fetching, after a page, and after decryption", async () => {
  const a = new AbortController();
  a.abort();
  await expect(load(a.signal)).rejects.toThrow();
  expect(from).not.toHaveBeenCalled();
  const b = new AbortController();
  page.mockImplementationOnce(async () => {
    b.abort();
    return { data: [], count: 0 };
  });
  await expect(load(b.signal)).rejects.toThrow();
  const c = new AbortController();
  page.mockResolvedValue({ data: [recapRow("a")], count: 1 });
  decrypt.mockImplementationOnce(async (row) => {
    c.abort();
    return recapRow(row.id);
  });
  await expect(load(c.signal)).rejects.toThrow();
});
