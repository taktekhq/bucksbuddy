import PostHog from "posthog-react-native";

// Same events as the PWA, through the React Native SDK. When no key is set
// (a fresh checkout without .env) every call is a silent no-op so the app
// still runs.
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
    capture: (event, properties) => client.capture(event, properties as never),
    identify: (distinctId, properties) => client.identify(distinctId, properties as never),
    reset: () => client.reset(),
  };
}

const posthog: Analytics = key
  ? real(new PostHog(key, { host: host || "https://us.i.posthog.com" }))
  : noop;

export default posthog;
