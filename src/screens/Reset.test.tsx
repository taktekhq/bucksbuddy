import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { updateUser, signOut } = vi.hoisted(() => ({
  updateUser: vi.fn(async () => ({ error: null as { message: string } | null })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { updateUser, signOut } },
}));

import { Reset } from "@/screens/Reset";

describe("Reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it("rejects passwords shorter than 8 characters without calling updateUser", async () => {
    render(<Reset />);
    await userEvent.type(screen.getByPlaceholderText("New password"), "short");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(
      await screen.findByText(/at least 8 characters/i),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling updateUser", async () => {
    render(<Reset />);
    await userEvent.type(screen.getByPlaceholderText("New password"), "abcd1234");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "abcd9999");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and signs the user out on success", async () => {
    render(<Reset />);
    await userEvent.type(screen.getByPlaceholderText("New password"), "abcd1234");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "abcd1234");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(updateUser).toHaveBeenCalledWith({ password: "abcd1234" });
    expect(await screen.findByText("All set")).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("surfaces the Supabase error and keeps the form usable", async () => {
    updateUser.mockResolvedValue({ error: { message: "token expired" } });
    render(<Reset />);
    await userEvent.type(screen.getByPlaceholderText("New password"), "abcd1234");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "abcd1234");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("token expired")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled();
  });

  it("Cancel signs out so the recovery session doesn't linger", async () => {
    render(<Reset />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
