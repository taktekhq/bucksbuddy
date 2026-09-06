// Test harness. React Native's own modules are handled by the jest-expo
// preset; what's left is the native modules this app talks to, which have no
// JS implementation off-device. Each is faked with the smallest thing that
// behaves like the real one, so tests exercise our logic rather than Expo's.

// Wires up RNTL's `screen` handle and its extra matchers, and registers the
// automatic cleanup between tests.
import "@testing-library/react-native";

// --- device keystore (lib/vault) -----------------------------------------
// An in-memory store with the same async API. Tests can reach in via
// `mockSecureStore` to seed or assert.
export const mockSecureStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlockedThisDeviceOnly",
  getItemAsync: jest.fn(async (k: string) => mockSecureStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecureStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecureStore.delete(k)),
}));

// --- AsyncStorage (lib/cache, lib/useHistoryGrouping) ---------------------
export const mockAsyncStorage = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsyncStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockAsyncStorage.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockAsyncStorage.delete(k)),
  },
}));

// --- analytics: a no-op that still records calls -------------------------
jest.mock("@/lib/posthog", () => ({
  __esModule: true,
  default: {
    capture: jest.fn(),
    captureException: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  },
}));

// --- Reanimated ----------------------------------------------------------
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// --- Sign in with Apple --------------------------------------------------
// iOS-only and entitlement-gated, so it never runs in a test environment.
// Default to unavailable; the Landing suite overrides it to cover the button.
jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
  AppleAuthenticationButton: "AppleAuthenticationButton",
  AppleAuthenticationButtonType: { CONTINUE: 2 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// --- expo modules used for side effects ----------------------------------
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: jest.fn().mockImplementation((_dir: string, name: string) => ({
    uri: `/cache/${name}`,
    write: jest.fn(),
  })),
}));

beforeEach(() => {
  mockSecureStore.clear();
  mockAsyncStorage.clear();
  jest.clearAllMocks();
});
