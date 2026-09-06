import { Platform } from "react-native";
import PostHog from "posthog-react-native";

// Same events as the PWA, through the React Native SDK. When no key is set
// (a fresh checkout without .env) every call is a silent no-op so the app
// still runs.
//
// Every event carries `platform` ("ios" / "android"), because the two apps
// report into one PostHog project. Web events have no such property, so the
// three are separable in a funnel instead of blurring into one number.
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

type Props = Record<string, string | number | boolean | null | undefined> | undefined;

type Analytics = {
  capture: (event: string, properties?: Props) => void;
  /**
   * Report a crash. Without it, a tester saying "it broke" leaves nothing to
   * look at — their console isn't reachable. Paired with the source maps EAS
   * uploads, the stack trace names real files rather than
   * `index.bundle:1:284719`.
   */
  captureException: (error: unknown, properties?: Props) => void;
  identify: (distinctId: string, properties?: Props) => void;
  reset: () => void;
};

const noop: Analytics = {
  capture() {},
  captureException() {},
  identify() {},
  reset() {},
};

function real(client: PostHog): Analytics {
  return {
    capture: (event, properties) =>
      client.capture(event, { ...properties, platform: Platform.OS } as never),
    captureException: (error, properties) =>
      client.captureException(error, { ...properties, platform: Platform.OS } as never),
    identify: (distinctId, properties) => client.identify(distinctId, properties as never),
    reset: () => client.reset(),
  };
}

const posthog: Analytics = key
  ? real(new PostHog(key, { host: host || "https://us.i.posthog.com" }))
  : noop;

export default posthog;
