import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Carrot } from "@/components/ui/Carrot";
import { Press } from "@/components/ui/Press";
import posthog from "@/lib/posthog";

// A render crash unmounts the whole React Native tree, so without this the app
// becomes a white screen with no way out and no report. This catches it, tells
// PostHog, and offers the one action that reliably helps: try again.
//
// It deliberately touches neither the store nor the router — either could be
// what just broke — so the fallback is plain, self-contained chrome.
type Props = { children: ReactNode };
type State = { crashed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    posthog.captureException(error, {
      // Which tree failed — the most useful thing when reading this back weeks
      // later with no idea what the user was doing.
      componentStack: info.componentStack ?? null,
      source: "render",
    });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
        <Carrot size={60} />
        <Text className="text-center text-xl font-bold text-label">
          That&apos;s not supposed to happen, Doc.
        </Text>
        <Text className="text-center text-[15px] leading-relaxed text-label-secondary">
          Something broke on this screen. Your entries are safe — they live on
          the server, not on this phone.
        </Text>
        <Press
          onPress={() => this.setState({ crashed: false })}
          className="mt-2 rounded-pill bg-carrot px-8 py-3.5"
        >
          <Text className="text-lg font-semibold text-white">Try again</Text>
        </Press>
      </View>
    );
  }
}
