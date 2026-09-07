// The web's posthog.ts is a bare `posthog.init(...)` with no test; the native
// one has real branches — it degrades to a silent no-op when no key is set, so
// a fresh checkout without .env still runs. Both paths are exercised here by
// re-requiring the module with a different env.
//
// `src/test/setup.ts` mocks "@/lib/posthog" for every other suite, so this file
// reaches for `jest.requireActual` to get the real module.

const mockCapture = jest.fn();
const mockCaptureException = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockConstruct = jest.fn();

jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: function PostHog(...args: unknown[]) {
    mockConstruct(...args);
    return {
      capture: mockCapture,
      captureException: mockCaptureException,
      identify: mockIdentify,
      reset: mockReset,
    };
  },
}));

type Analytics = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  captureException: (error: unknown, properties?: Record<string, unknown>) => void;
  identify: (id: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};

const KEY_VAR = "EXPO_PUBLIC_POSTHOG_KEY";
const HOST_VAR = "EXPO_PUBLIC_POSTHOG_HOST";

function loadModule(): Analytics {
  let mod!: { default: Analytics };
  jest.isolateModules(() => {
    mod = jest.requireActual("@/lib/posthog") as { default: Analytics };
  });
  return mod.default;
}

describe("posthog", () => {
  const original = { key: process.env[KEY_VAR], host: process.env[HOST_VAR] };

  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  afterEach(() => {
    restore(KEY_VAR, original.key);
    restore(HOST_VAR, original.host);
  });

  it("forwards every call to the SDK when a key is configured", () => {
    process.env[KEY_VAR] = "phc_test";
    process.env[HOST_VAR] = "https://eu.i.posthog.com";

    const posthog = loadModule();
    expect(mockConstruct).toHaveBeenCalledWith("phc_test", {
      host: "https://eu.i.posthog.com",
      // Load-bearing, not decoration: React Native only tracks promise
      // rejections under __DEV__, so without this a crash in an async onPress
      // is discarded on a release build and the screen just sits there.
      errorTracking: {
        autocapture: { uncaughtExceptions: true, unhandledRejections: true },
      },
    });

    // Every event is stamped with the platform so the two apps stay apart in
    // a PostHog project that also receives the web's events.
    posthog.capture("signed_in", { plan: "free" });
    expect(mockCapture).toHaveBeenCalledWith("signed_in", {
      plan: "free",
      platform: "ios",
    });

    posthog.capture("csv_exported");
    expect(mockCapture).toHaveBeenCalledWith("csv_exported", { platform: "ios" });

    // Crashes carry the platform too, so an iOS-only bug reads as one.
    const boom = new Error("kaboom");
    posthog.captureException(boom, { source: "render" });
    expect(mockCaptureException).toHaveBeenCalledWith(boom, {
      source: "render",
      platform: "ios",
    });

    posthog.identify("u1", { email: "x@y.com" });
    expect(mockIdentify).toHaveBeenCalledWith("u1", { email: "x@y.com" });

    posthog.reset();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("falls back to the US host when none is configured", () => {
    process.env[KEY_VAR] = "phc_test";
    delete process.env[HOST_VAR];

    loadModule();
    expect(mockConstruct).toHaveBeenCalledWith("phc_test", {
      host: "https://us.i.posthog.com",
      errorTracking: {
        autocapture: { uncaughtExceptions: true, unhandledRejections: true },
      },
    });
  });

  it("is a silent no-op with no key — the app still runs", () => {
    delete process.env[KEY_VAR];

    const posthog = loadModule();
    expect(mockConstruct).not.toHaveBeenCalled();

    expect(() => {
      posthog.capture("signed_in");
      posthog.captureException(new Error("kaboom"));
      posthog.identify("u1");
      posthog.reset();
    }).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});
