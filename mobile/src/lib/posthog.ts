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
  identify: (distinctId: string, properties?: Props) => void;
  reset: () => void;
};

const noop: Analytics = { capture() {}, identify() {}, reset() {} };

function real(client: PostHog): Analytics {
  return {
    capture: (event, properties) =>
      client.capture(event, { ...properties, platform: Platform.OS } as never),
    identify: (distinctId, properties) => client.identify(distinctId, properties as never),
    reset: () => client.reset(),
  };
}

const posthog: Analytics = key
  ? real(new PostHog(key, { host: host || "https://us.i.posthog.com" }))
  : noop;

export default posthog;
