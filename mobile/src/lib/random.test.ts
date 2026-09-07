// The bug this guards against did not look like a crypto bug on the device: the
// app read and unlocked fine, and every save silently wedged. So these tests
// care about two things — after installCsprng the runtime has a working
// `crypto.getRandomValues`, and a source that only *looks* like one is refused
// rather than trusted with a master key.
//
// jest-expo's own expo-crypto mock returns all zeros, which is precisely the
// dangerous case, so nothing here can lean on the ambient one.

type Fill = (array: Uint8Array) => Uint8Array;
type Scope = { crypto?: { getRandomValues?: unknown } };

// `native` is installed as a module side effect, so every test needs its own
// copy of the module and its own idea of what expo-crypto is.
function withExpoCrypto(getRandomValues: Fill | null) {
  jest.resetModules();
  jest.doMock("expo-crypto", () => {
    if (!getRandomValues) throw new Error("Cannot find native module 'ExpoCrypto'");
    return { getRandomValues };
  });
  return require("@/lib/random") as typeof import("@/lib/random");
}

/** A source that returns something different every draw, as a real one does. */
function varying(): Fill {
  let n = 0;
  return (array) => {
    for (let i = 0; i < array.length; i += 1) {
      n += 1;
      array[i] = (n % 251) + 1;
    }
    return array;
  };
}

afterEach(() => jest.resetModules());

describe("installCsprng", () => {
  it("leaves a runtime that already has one alone", () => {
    // node, and therefore jest. Replacing a working WebCrypto with a bridge
    // call would be slower and no safer.
    const own = () => new Uint8Array();
    const scope: Scope = { crypto: { getRandomValues: own } };
    expect(withExpoCrypto(varying()).installCsprng(scope)).toBe(false);
    expect(scope.crypto?.getRandomValues).toBe(own);
  });

  it("installs the whole crypto object when the runtime has none", () => {
    // Hermes: `globalThis.crypto` is simply not there.
    const scope: Scope = {};
    expect(withExpoCrypto(varying()).installCsprng(scope)).toBe(true);
    const filled = (scope.crypto?.getRandomValues as Fill)(new Uint8Array(4));
    expect(filled).toHaveLength(4);
    expect(Array.from(filled).some((byte) => byte !== 0)).toBe(true);
  });

  it("fills in the hole when crypto exists but is partial", () => {
    // Some hosts ship randomUUID and nothing else; keep what is there.
    const randomUUID = () => "id";
    const scope: Scope = { crypto: { randomUUID } as Scope["crypto"] };
    expect(withExpoCrypto(varying()).installCsprng(scope)).toBe(true);
    expect(typeof scope.crypto?.getRandomValues).toBe("function");
    expect((scope.crypto as { randomUUID?: unknown }).randomUUID).toBe(randomUUID);
  });

  it("replaces a crypto exposed as a getter with no setter", () => {
    // Plain assignment is a no-op against one of these, and fails silently in a
    // release build — the same shape of bug as the one being fixed.
    const scope: Scope = {};
    Object.defineProperty(scope, "crypto", { get: () => undefined, configurable: true });
    expect(withExpoCrypto(varying()).installCsprng(scope)).toBe(true);
    expect(typeof scope.crypto?.getRandomValues).toBe("function");
  });

  it("installs nothing when the native module is not in the binary", () => {
    // An over-the-air update pushed to a build compiled without expo-crypto.
    // Throwing here would stop the app from starting at all, which is worse
    // than the failure this file exists to fix.
    const scope: Scope = {};
    expect(withExpoCrypto(null).installCsprng(scope)).toBe(false);
    expect(scope.crypto).toBeUndefined();
  });

  it("refuses a source that returns zeros", () => {
    // Not hypothetical: this is exactly what jest-expo's expo-crypto mock does.
    // Installing it would make every master key, IV and salt predictable while
    // every test stayed green.
    const scope: Scope = {};
    expect(withExpoCrypto((a) => a.fill(0)).installCsprng(scope)).toBe(false);
    expect(scope.crypto).toBeUndefined();
  });

  it("refuses a source that returns the same bytes every draw", () => {
    const scope: Scope = {};
    expect(withExpoCrypto((a) => a.fill(7)).installCsprng(scope)).toBe(false);
    expect(scope.crypto).toBeUndefined();
  });

  it("refuses a source that throws", () => {
    const scope: Scope = {};
    const broken: Fill = () => {
      throw new Error("bridge is down");
    };
    expect(withExpoCrypto(broken).installCsprng(scope)).toBe(false);
    expect(scope.crypto).toBeUndefined();
  });

  it("defaults to the real global, and this runtime needs no help", () => {
    // Covers the default argument. jest runs on node, which has WebCrypto, so
    // the honest assertion here is that nothing was installed.
    expect(withExpoCrypto(varying()).installCsprng()).toBe(false);
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
  });
});
