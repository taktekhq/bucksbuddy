// NativeWind: the compiled stylesheet. Importing it is what puts the class
// definitions into the bundle — without this line no className resolves.
import "../global.css";

import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import posthog from "@/lib/posthog";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/lib/useSession";
import { navigationRef, type StackParams } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Carrot } from "@/components/ui/Carrot";
import { Landing } from "@/screens/Landing";
import { Legal } from "@/screens/Legal";
import { Contact } from "@/screens/Contact";
import { Home } from "@/screens/Home";
import { History } from "@/screens/History";
import { Stats } from "@/screens/Stats";
import { Receipts } from "@/screens/Receipts";
import { Settings } from "@/screens/Settings";
import { Safe } from "@/screens/Safe";
import { Reset } from "@/screens/Reset";
import { OBSERVATORY, RABBIT_HOLE, VAULT, colors } from "@/lib/theme";

// One native stack per signed-in / signed-out world; the session decides which
// is mounted. Screen names are the PWA's routes (see lib/router.ts), so
// `navigate("/safe")` pushes the Safe with the platform's own push transition
// and the edge swipe pops it — the smoothness the hash router never had.
const Stack = createNativeStackNavigator<StackParams>();

// Every screen paints its own chrome (the web's <header>), so the native
// header stays off. Each screen also owns its floor color so the push
// transition never flashes the wrong background.
const screenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: "default",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: colors.canvas },
};

const dark = (color: string): NativeStackNavigationOptions => ({
  contentStyle: { backgroundColor: color },
});

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.canvas },
};

function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <StatusBar style="dark" />
      <Carrot size={60} />
    </View>
  );
}

// Signed-out: the marketing landing owns "/" and the public pages push on top.
function PublicStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions} initialRouteName="/">
      <Stack.Screen name="/" component={Landing} />
      <Stack.Screen name="/legal" component={Legal} />
      <Stack.Screen name="/contact" component={Contact} />
      <Stack.Screen name="/stats" options={dark(OBSERVATORY.floor)}>
        {() => <Stats signedIn={false} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

// Signed-in: Home is the root; everything else pushes. The store lives above
// the navigator so it survives every push/pop instead of refetching per page.
function AppStack({ userId }: { userId: string }) {
  return (
    <StoreProvider userId={userId}>
      <Stack.Navigator screenOptions={screenOptions} initialRouteName="/">
        <Stack.Screen name="/" component={Home} />
        <Stack.Screen name="/settings" component={Settings} />
        <Stack.Screen name="/safe" component={Safe} options={dark(VAULT.floor)} />
        <Stack.Screen name="/history" component={History} options={dark(RABBIT_HOLE.floor)} />
        <Stack.Screen name="/stats" options={dark(OBSERVATORY.floor)}>
          {() => <Stats signedIn />}
        </Stack.Screen>
        <Stack.Screen name="/stats/treats" options={dark(OBSERVATORY.floor)}>
          {() => <Receipts kind="treats" />}
        </Stack.Screen>
        <Stack.Screen name="/stats/weekend" options={dark(OBSERVATORY.floor)}>
          {() => <Receipts kind="weekend" />}
        </Stack.Screen>
        <Stack.Screen name="/legal" component={Legal} />
        <Stack.Screen name="/contact" component={Contact} />
      </Stack.Navigator>
    </StoreProvider>
  );
}

function Root() {
  const { session, ready, recoveryMode } = useSession();

  if (recoveryMode) {
    // Password recovery wins over route + session: the user opened a reset
    // link from email, the SDK swapped the token for a session, and now they
    // need to set a new password before doing anything else.
    return <Reset />;
  }
  if (!ready) return <Splash />;
  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      {session ? <AppStack userId={session.user.id} /> : <PublicStack />}
    </NavigationContainer>
  );
}

// Errors thrown outside React — in a promise, a timer, a native callback —
// never reach the boundary below. React Native routes them here instead, and
// without this they die in a console nobody can read once the app is on a
// tester's phone.
const defaultHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  posthog.captureException(error, { source: "uncaught", fatal: Boolean(isFatal) });
  defaultHandler?.(error, isFatal);
});

export default function App() {
  // Grobold is the cartoon hijack; everything else is the platform font. Hold
  // the splash until it's in so the wordmark never flashes a fallback.
  const [fontsLoaded] = useFonts({
    Grobold: require("../assets/fonts/Grobold.ttf"),
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>{fontsLoaded ? <Root /> : <Splash />}</ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
});
