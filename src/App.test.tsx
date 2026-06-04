import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useSession = vi.fn();
const useRoute = vi.fn();

vi.mock("@/lib/useSession", () => ({ useSession: () => useSession() }));
vi.mock("@/lib/router", () => ({ useRoute: () => useRoute() }));
vi.mock("@/lib/store", () => ({
  StoreProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="store">{children}</div>
  ),
}));
vi.mock("@/screens/Login", () => ({ Login: () => <div>LoginScreen</div> }));
vi.mock("@/screens/Landing", () => ({ Landing: () => <div>LandingScreen</div> }));
vi.mock("@/screens/Legal", () => ({ Legal: () => <div>LegalScreen</div> }));
vi.mock("@/screens/Home", () => ({ Home: () => <div>HomeScreen</div> }));
vi.mock("@/screens/Settings", () => ({ Settings: () => <div>SettingsScreen</div> }));
vi.mock("@/screens/Safe", () => ({ Safe: () => <div>SafeScreen</div> }));

import App from "@/App";

const session = { user: { id: "u1" } };

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRoute.mockReturnValue("/");
  });

  it("shows the splash carrot until the session is ready", () => {
    useSession.mockReturnValue({ session: null, ready: false });
    render(<App />);
    expect(screen.getByRole("img", { name: "carrot" })).toBeInTheDocument();
  });

  it("shows the login screen when signed out", () => {
    useSession.mockReturnValue({ session: null, ready: true });
    render(<App />);
    expect(screen.getByText("LoginScreen")).toBeInTheDocument();
  });

  it("shows the landing page at /home regardless of session", () => {
    useRoute.mockReturnValue("/home");
    useSession.mockReturnValue({ session: null, ready: true });
    const { rerender } = render(<App />);
    expect(screen.getByText("LandingScreen")).toBeInTheDocument();

    // Still the landing even while signed in — it's a previewable public page.
    useSession.mockReturnValue({ session, ready: true });
    rerender(<App />);
    expect(screen.getByText("LandingScreen")).toBeInTheDocument();
  });

  it("shows the public legal page regardless of session", () => {
    useSession.mockReturnValue({ session: null, ready: true });
    useRoute.mockReturnValue("/legal");
    render(<App />);
    expect(screen.getByText("LegalScreen")).toBeInTheDocument();
  });

  it("routes to Home, Settings and Safe when signed in", () => {
    useSession.mockReturnValue({ session, ready: true });

    useRoute.mockReturnValue("/");
    const { rerender } = render(<App />);
    expect(screen.getByText("HomeScreen")).toBeInTheDocument();

    useRoute.mockReturnValue("/settings");
    rerender(<App />);
    expect(screen.getByText("SettingsScreen")).toBeInTheDocument();

    useRoute.mockReturnValue("/safe");
    rerender(<App />);
    expect(screen.getByText("SafeScreen")).toBeInTheDocument();
  });
});
