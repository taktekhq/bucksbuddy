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
vi.mock("@/screens/Landing", () => ({ Landing: () => <div>LandingScreen</div> }));
vi.mock("@/screens/Legal", () => ({ Legal: () => <div>LegalScreen</div> }));
vi.mock("@/screens/Contact", () => ({ Contact: () => <div>ContactScreen</div> }));
vi.mock("@/screens/Home", () => ({ Home: () => <div>HomeScreen</div> }));
vi.mock("@/screens/History", () => ({ History: () => <div>HistoryScreen</div> }));
vi.mock("@/screens/Settings", () => ({ Settings: () => <div>SettingsScreen</div> }));
vi.mock("@/screens/Safe", () => ({ Safe: () => <div>SafeScreen</div> }));
vi.mock("@/screens/Reset", () => ({ Reset: () => <div>ResetScreen</div> }));

import App from "@/App";

const session = { user: { id: "u1" } };

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRoute.mockReturnValue("/");
  });

  it("shows the splash carrot until the session is ready", () => {
    useSession.mockReturnValue({ session: null, ready: false, recoveryMode: false });
    render(<App />);
    expect(screen.getByRole("img", { name: "carrot" })).toBeInTheDocument();
  });

  it("shows the landing page when signed out", () => {
    useSession.mockReturnValue({ session: null, ready: true, recoveryMode: false });
    render(<App />);
    expect(screen.getByText("LandingScreen")).toBeInTheDocument();
  });

  it("shows the public legal page regardless of session", () => {
    useSession.mockReturnValue({ session: null, ready: true, recoveryMode: false });
    useRoute.mockReturnValue("/legal");
    render(<App />);
    expect(screen.getByText("LegalScreen")).toBeInTheDocument();
  });

  it("shows the public contact page regardless of session", () => {
    useSession.mockReturnValue({ session: null, ready: true, recoveryMode: false });
    useRoute.mockReturnValue("/contact");
    render(<App />);
    expect(screen.getByText("ContactScreen")).toBeInTheDocument();
  });

  it("shows the reset screen when recoveryMode is active, even on top of a session", () => {
    // Recovery wins over everything — session, route, even /legal. Without
    // recoveryMode the Reset screen is unreachable, which is the security
    // contract: only the PASSWORD_RECOVERY event from a reset link can show it.
    useSession.mockReturnValue({ session, ready: true, recoveryMode: true });
    useRoute.mockReturnValue("/legal");
    render(<App />);
    expect(screen.getByText("ResetScreen")).toBeInTheDocument();
    expect(screen.queryByText("LegalScreen")).not.toBeInTheDocument();
  });

  it("routes to Home, Settings, Safe and History when signed in", () => {
    useSession.mockReturnValue({ session, ready: true, recoveryMode: false });

    useRoute.mockReturnValue("/");
    const { rerender } = render(<App />);
    expect(screen.getByText("HomeScreen")).toBeInTheDocument();

    useRoute.mockReturnValue("/settings");
    rerender(<App />);
    expect(screen.getByText("SettingsScreen")).toBeInTheDocument();

    useRoute.mockReturnValue("/safe");
    rerender(<App />);
    expect(screen.getByText("SafeScreen")).toBeInTheDocument();

    useRoute.mockReturnValue("/history");
    rerender(<App />);
    expect(screen.getByText("HistoryScreen")).toBeInTheDocument();
  });
});
