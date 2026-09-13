import { recapFixture } from "../../src/test/recapFixture";
// No account, email, real transactions or auth client in this visual harness.
const transactions = [];
const loadRecapMonth = async (date: Date) =>
  recapFixture.map((row) => ({
    ...row,
    amount_usd_cents:
      row.amount_usd_cents *
      (location.search.includes("stress") ? 100000000 : 1),
    occurred_at: new Date(
      date.getFullYear(),
      date.getMonth(),
      15,
      12,
    ).toISOString(),
  }));
export const useStore = () => ({
  loading: false,
  initializationError: false,
  locked: false,
  transactions,
  loadRecapMonth,
  homeCurrency: location.search.includes("stress") ? "LBP" : "EUR",
  refresh: async () => {},
});
