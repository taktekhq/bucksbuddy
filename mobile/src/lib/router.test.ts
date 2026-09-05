// The web's router is a hash router; this one drives a react-navigation native
// stack. Same public shape (`navigate("/safe")`), so the assertions below are
// the mobile equivalents of ../../../src/lib/router.test.tsx: "/" pops to the
// top, any other route pushes, and back() only pops when there's something
// underneath.
jest.mock("@react-navigation/native", () => {
  const ref = {
    isReady: jest.fn(() => true),
    getCurrentRoute: jest.fn(() => ({ name: "/" })),
    dispatch: jest.fn(),
    canGoBack: jest.fn(() => false),
    goBack: jest.fn(),
  };
  return {
    // router.ts calls this once at import; hand back the same ref every time so
    // the test can drive it.
    createNavigationContainerRef: jest.fn(() => ref),
    StackActions: {
      popToTop: jest.fn(() => ({ type: "POP_TO_TOP" })),
      push: jest.fn((name: string) => ({ type: "PUSH", name })),
    },
  };
});

import {
  StackActions,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { back, currentRoute, navigate, navigationRef } from "@/lib/router";

const ref = createNavigationContainerRef() as unknown as {
  isReady: jest.Mock;
  getCurrentRoute: jest.Mock;
  dispatch: jest.Mock;
  canGoBack: jest.Mock;
  goBack: jest.Mock;
};

beforeEach(() => {
  ref.isReady.mockReturnValue(true);
  ref.getCurrentRoute.mockReturnValue({ name: "/" });
  ref.canGoBack.mockReturnValue(false);
});

describe("currentRoute", () => {
  it("exposes the shared navigation ref", () => {
    expect(navigationRef).toBe(ref);
  });

  it("is '/' before the container is ready", () => {
    ref.isReady.mockReturnValue(false);
    expect(currentRoute()).toBe("/");
    expect(ref.getCurrentRoute).not.toHaveBeenCalled();
  });

  it("reports the focused screen's name", () => {
    ref.getCurrentRoute.mockReturnValue({ name: "/settings" });
    expect(currentRoute()).toBe("/settings");
  });

  it("falls back to '/' when nothing is focused yet", () => {
    ref.getCurrentRoute.mockReturnValue(undefined);
    expect(currentRoute()).toBe("/");
  });
});

describe("navigate", () => {
  it("does nothing before the container is ready", () => {
    ref.isReady.mockReturnValue(false);
    navigate("/safe");
    expect(ref.dispatch).not.toHaveBeenCalled();
  });

  it("is a no-op when already on the route", () => {
    ref.getCurrentRoute.mockReturnValue({ name: "/safe" });
    navigate("/safe");
    expect(ref.dispatch).not.toHaveBeenCalled();
  });

  it("pops to the top for '/' rather than pushing another home", () => {
    ref.getCurrentRoute.mockReturnValue({ name: "/settings" });
    navigate("/");
    expect(StackActions.popToTop).toHaveBeenCalledTimes(1);
    expect(StackActions.push).not.toHaveBeenCalled();
    expect(ref.dispatch).toHaveBeenCalledWith({ type: "POP_TO_TOP" });
  });

  it("pushes any other route on top of what's showing", () => {
    navigate("/history");
    expect(StackActions.push).toHaveBeenCalledWith("/history");
    expect(ref.dispatch).toHaveBeenCalledWith({ type: "PUSH", name: "/history" });
  });

  it("pushes the receipts routes under /stats", () => {
    ref.getCurrentRoute.mockReturnValue({ name: "/stats" });
    navigate("/stats/treats");
    expect(ref.dispatch).toHaveBeenCalledWith({
      type: "PUSH",
      name: "/stats/treats",
    });
  });
});

describe("back", () => {
  it("does nothing before the container is ready", () => {
    ref.isReady.mockReturnValue(false);
    back();
    expect(ref.goBack).not.toHaveBeenCalled();
  });

  it("does nothing at the root of the stack", () => {
    ref.canGoBack.mockReturnValue(false);
    back();
    expect(ref.goBack).not.toHaveBeenCalled();
  });

  it("pops one screen when there is one underneath", () => {
    ref.canGoBack.mockReturnValue(true);
    back();
    expect(ref.goBack).toHaveBeenCalledTimes(1);
  });
});
