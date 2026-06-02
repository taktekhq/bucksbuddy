import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeSupabaseMock, type Handler } from "@/test/supabaseMock";
import { makeStoreValue } from "@/test/storeValue";

let sb = makeSupabaseMock();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (t: string) => sb.supabase.from(t),
    auth: {
      getSession: (...a: unknown[]) => sb.supabase.auth.getSession(...a),
      signOut: (...a: unknown[]) => sb.supabase.auth.signOut(...a),
    },
  },
}));

const navigate = vi.fn();
vi.mock("@/lib/router", () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

vi.mock("@/lib/store", () => ({ useStore: () => makeStoreValue() }));

import { Settings } from "@/screens/Settings";

function setup(handlers: Record<string, Handler> = {}, email: string | null = null) {
  sb = makeSupabaseMock(handlers);
  sb.supabase.auth.getSession.mockResolvedValue({
    data: { session: email === null ? null : { user: { email } } },
  });
  return render(<Settings />);
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("shows the signed-in email", async () => {
    setup({}, "user@example.com");
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it("falls back to an em dash with no email", async () => {
    setup({}, null);
    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("navigates home from the back button", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("exports a CSV blob and triggers a download", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setup({
      "transactions:select": () => ({
        data: [
          {
            id: "1",
            user_id: "u1",
            is_income: false,
            category: "gas",
            amount_usd_cents: 1000,
            original_currency: "USD",
            original_amount: 10,
            rate_used: 89500,
            occurred_at: "2026-06-01",
            note: null,
            created_at: "2026-06-01",
          },
        ],
        error: null,
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    clickSpy.mockRestore();
  });

  it("exports an empty CSV when there are no rows", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setup({ "transactions:select": () => ({ data: null, error: null }) });
    await userEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("signs out", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(sb.supabase.auth.signOut).toHaveBeenCalled();
  });
});
