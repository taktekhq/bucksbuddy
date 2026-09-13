import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { makeStoreValue } from "@/test/storeValue";
import { recapFixture, recapRow } from "@/test/recapFixture";
import { monthKey } from "@/lib/recap";
import { RecapScreen } from "./Recap";
const { png, share, download, track, navigate, refreshEvent, remove } =
  vi.hoisted(() => ({
    png: vi.fn(),
    share: vi.fn(),
    download: vi.fn(),
    track: vi.fn(),
    navigate: vi.fn(),
    refreshEvent: { current: () => {} },
    remove: vi.fn(),
  }));
vi.mock("@/lib/recapExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recapExport")>()),
  renderRecapPng: png,
  shareRecap: share,
  downloadRecap: download,
  trackRecap: track,
}));
vi.mock("@/lib/router", () => ({ navigate }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: (_a: unknown, _b: unknown, cb: () => void) => {
        refreshEvent.current = cb;
        return { subscribe: () => "channel" };
      },
    }),
    removeChannel: remove,
  },
}));
let store = makeStoreValue();
vi.mock("@/lib/store", () => ({ useStore: () => store }));
const load = vi.fn();
const blob = new Blob(["pixels"], { type: "image/png" });
const ready = () =>
  waitFor(() =>
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeEnabled(),
  );
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent;
    },
  });
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/#/recap?month=2025-12");
  load.mockReset().mockResolvedValue(recapFixture);
  png.mockReset().mockResolvedValue(blob);
  share.mockReset().mockResolvedValue("resolved");
  download.mockReset();
  store = makeStoreValue({ loadRecapMonth: load, homeCurrency: "EUR" });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
it("defaults privacy off and shares exactly the preview with no identifiers or hidden financial values", async () => {
  const { unmount, container } = render(<RecapScreen />);
  await ready();
  expect(screen.getByLabelText("Show amounts")).not.toBeChecked();
  expect(screen.getByLabelText("Show name")).not.toBeChecked();
  expect(screen.getByLabelText("Include funny caption")).toBeChecked();
  expect(screen.getByRole("img").getAttribute("alt")).toContain(
    "Logged entries",
  );
  expect(container.innerHTML).not.toMatch(
    /228\.00|600\.00|private-user|private-note|999999/,
  );
  fireEvent.click(screen.getByText("Share card"));
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(share.mock.calls[0][0].name).toBe(
    "bucksbuddy-recap-2025-12-trading.png",
  );
  expect(share.mock.calls[0][0].type).toBe("image/png");
  fireEvent.click(screen.getByText("Download PNG"));
  expect(download).toHaveBeenCalledWith(
    "blob:preview",
    "bucksbuddy-recap-2025-12-trading.png",
  );
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  expect(remove).toHaveBeenCalledWith("channel");
});
it("customizes both styles, keeps toggles, trims Unicode names and completely removes captions and hidden amounts", async () => {
  render(<RecapScreen />);
  await ready();
  fireEvent.click(screen.getByLabelText("Show amounts"));
  fireEvent.click(screen.getByLabelText("Show name"));
  fireEvent.change(screen.getByLabelText(/Display name/), {
    target: { value: "  Alex  " },
  });
  await ready();
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("Alex'S COLLECTION"),
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("€228.00"),
  );
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "collected" },
  });
  await ready();
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("MONTH, COLLECTED."),
  );
  fireEvent.change(screen.getByLabelText("Style"), {
    target: { value: "monthly" },
  });
  await ready();
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("Alex, your month was"),
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("€600.00"),
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("Groceries"),
  );
  fireEvent.click(screen.getByLabelText("Include funny caption"));
  fireEvent.click(screen.getByLabelText("Show name"));
  fireEvent.click(screen.getByLabelText("Show amounts"));
  await ready();
  expect(screen.getByRole("img").getAttribute("alt")).not.toMatch(
    /Alex|€|Every entry/,
  );
  fireEvent.change(screen.getByLabelText("Style"), {
    target: { value: "trading" },
  });
  await ready();
  expect(screen.getByLabelText("Title")).toHaveValue("collected");
});
it("resets an ineligible title on a new month and ignores invalid/future input", async () => {
  load
    .mockResolvedValueOnce([recapRow("park", "parking")])
    .mockResolvedValue([]);
  render(<RecapScreen />);
  await ready();
  expect(screen.getByLabelText("Title")).toHaveValue("parking");
  fireEvent.change(screen.getByLabelText("Month and year"), {
    target: { value: "9999-12" },
  });
  expect(screen.getByLabelText("Month and year")).toHaveValue("2025-12");
  fireEvent.change(screen.getByLabelText("Month and year"), {
    target: { value: "2025-11" },
  });
  await screen.findByText("No spending logged for this month yet.");
  expect(screen.getByLabelText("Title")).toHaveValue("collected");
  fireEvent.click(screen.getByText("Choose another month"));
  expect(screen.getByLabelText("Month and year")).toHaveFocus();
  fireEvent.click(screen.getByText("Add expense"));
  expect(navigate).toHaveBeenCalledWith("/");
  fireEvent.click(screen.getByLabelText("Back to Stats"));
  expect(navigate).toHaveBeenCalledWith("/stats");
});
it("defaults direct visits to current month and labels it in the image", async () => {
  window.history.replaceState(null, "", "/#/recap");
  load.mockResolvedValue([
    recapRow("now", "food", 100, { occurred_at: new Date().toISOString() }),
  ]);
  render(<RecapScreen />);
  await ready();
  expect(screen.getByLabelText("Month and year")).toHaveValue(monthKey());
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    expect.stringContaining("Month so far"),
  );
  expect(track).toHaveBeenCalledWith(
    "recap_opened",
    { style: "trading", period: "current" },
    "open",
  );
});
it("blocks loading and locked data, drops generated images on lock, uses existing unlock flow", async () => {
  store.loading = true;
  const { rerender } = render(<RecapScreen />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(load).not.toHaveBeenCalled();
  store = { ...store, loading: false };
  rerender(<RecapScreen />);
  await ready();
  store = { ...store, locked: true };
  rerender(<RecapScreen />);
  expect(screen.queryByText("Download PNG")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  fireEvent.click(screen.getByText("Unlock in Settings"));
  expect(navigate).toHaveBeenCalledWith("/settings");
});
it("ignores stale month loads and stale failed requests", async () => {
  const old = deferred<typeof recapFixture>();
  const next = deferred<typeof recapFixture>();
  load
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise)
    .mockResolvedValue([]);
  render(<RecapScreen />);
  fireEvent.change(screen.getByLabelText("Month and year"), {
    target: { value: "2025-11" },
  });
  await act(async () => old.resolve(recapFixture));
  expect(screen.queryByText("Download PNG")).toBeNull();
  fireEvent.change(screen.getByLabelText("Month and year"), {
    target: { value: "2025-10" },
  });
  await act(async () => next.reject(new Error("stale")));
  expect(screen.queryByRole("alert")).toBeNull();
  await screen.findByText("No spending logged for this month yet.");
});
it("blocks incomplete, offline, decrypt and invalid-data errors with retry and correction", async () => {
  load
    .mockRejectedValueOnce(new Error("private error payload"))
    .mockResolvedValueOnce([recapRow("bad", "food", -1)])
    .mockResolvedValue(recapFixture);
  render(<RecapScreen />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Download PNG")).toBeNull();
  fireEvent.click(screen.getByText("Open History"));
  expect(navigate).toHaveBeenCalledWith("/history");
  fireEvent.click(screen.getByText("Retry"));
  await screen.findByRole("alert");
  expect(screen.queryByText("Download PNG")).toBeNull();
  fireEvent.click(screen.getByText("Retry"));
  await ready();
  expect(JSON.stringify(track.mock.calls)).not.toContain(
    "private error payload",
  );
});
it("reloads after store writes, realtime changes, reconnect, focus and month hash changes", async () => {
  const { rerender } = render(<RecapScreen />);
  await ready();
  store = makeStoreValue({ ...store, transactions: [recapRow("edited")] });
  rerender(<RecapScreen />);
  await ready();
  for (const type of ["online", "focus"]) {
    fireEvent(window, new Event(type));
    await ready();
  }
  act(() => refreshEvent.current());
  await ready();
  expect(load).toHaveBeenCalledTimes(5);
  window.history.replaceState(null, "", "/#/recap?month=2025-11");
  fireEvent(window, new HashChangeEvent("hashchange"));
  await screen.findByText("No spending logged for this month yet.");
  expect(screen.getByLabelText("Month and year")).toHaveValue("2025-11");
});
it("preserves the preview/settings after PNG failure and lets a retry succeed", async () => {
  png.mockRejectedValueOnce(new Error("render failed"));
  render(<RecapScreen />);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Download PNG" })).toBeDisabled();
  expect(screen.getByRole("article")).toHaveTextContent("CERTIFIED FOODIE.");
  fireEvent.click(screen.getByText("Retry PNG"));
  await ready();
  expect(track).toHaveBeenCalledWith(
    "recap_failed",
    { style: "trading", period: "past" },
    "render",
  );
});
it("discards obsolete PNG results/errors and revokes URLs on settings changes", async () => {
  const old = deferred<Blob>();
  const second = deferred<Blob>();
  png
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(blob);
  render(<RecapScreen />);
  await screen.findByText("Preparing your PNG…");
  fireEvent.click(screen.getByLabelText("Show amounts"));
  await act(async () => old.resolve(blob));
  expect(screen.getByRole("button", { name: "Download PNG" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Show amounts"));
  await act(async () => second.reject(new Error("old render")));
  await ready();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByLabelText("Include funny caption"));
  await ready();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("offers fresh PNG-only sharing and download fallback, with neutral cancellation", async () => {
  share
    .mockResolvedValueOnce("rejected")
    .mockResolvedValueOnce("cancelled")
    .mockResolvedValueOnce("download");
  render(<RecapScreen />);
  await ready();
  fireEvent.click(screen.getByText("Share card"));
  await screen.findByText("Share PNG only");
  fireEvent.click(screen.getByText("Share PNG only"));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  expect(share.mock.calls[1][2]).toBe(true);
  expect(download).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText("Share card")).toBeEnabled());
  fireEvent.click(screen.getByText("Share card"));
  await waitFor(() => expect(download).toHaveBeenCalled());
});
it("handles download failure and ignores pending sharing after unmount", async () => {
  download.mockImplementationOnce(() => {
    throw new Error("download failed");
  });
  const pending = deferred<string>();
  share.mockReturnValueOnce(pending.promise);
  const { unmount } = render(<RecapScreen />);
  await ready();
  fireEvent.click(screen.getByText("Download PNG"));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Share card"));
  unmount();
  await act(async () => pending.resolve("download"));
  expect(download).toHaveBeenCalledTimes(1);
});
it("does not save a stale card after settings change during sharing", async () => {
  const pending = deferred<string>();
  share.mockReturnValueOnce(pending.promise);
  render(<RecapScreen />);
  await ready();
  fireEvent.click(screen.getByText("Share card"));
  fireEvent.click(screen.getByLabelText("Show amounts"));
  await ready();
  await act(async () => pending.resolve("download"));
  expect(download).not.toHaveBeenCalled();
});
it("reports bounded current-month load and rendering failures", async () => {
  window.history.replaceState(null, "", "/#/recap");
  load
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([
      recapRow("now", "food", 100, { occurred_at: new Date().toISOString() }),
    ]);
  png.mockRejectedValueOnce(new Error("font failed"));
  render(<RecapScreen />);
  await screen.findByRole("alert");
  expect(track).toHaveBeenCalledWith(
    "recap_failed",
    { style: "trading", period: "current" },
    "load",
  );
  fireEvent.click(screen.getByText("Retry"));
  await screen.findByText("Retry PNG");
  expect(track).toHaveBeenCalledWith(
    "recap_failed",
    { style: "trading", period: "current" },
    "render",
  );
});
it("disables rejected-share retry while a changed card is being regenerated", async () => {
  share.mockResolvedValueOnce("rejected");
  render(<RecapScreen />);
  await ready();
  fireEvent.click(screen.getByText("Share card"));
  await screen.findByText("Share PNG only");
  png.mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(screen.getByLabelText("Show amounts"));
  expect(screen.getByText("Share card")).toBeDisabled();
  expect(screen.queryByText("Share PNG only")).toBeNull();
});
it("retries failed app initialization instead of waiting indefinitely", async () => {
  store = makeStoreValue({ loading: true, initializationError: true });
  render(<RecapScreen />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Retry"));
  expect(store.refresh).toHaveBeenCalled();
  expect(screen.queryByText("Download PNG")).toBeNull();
});
