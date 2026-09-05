import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
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
import { colors } from "@/lib/theme";

function Splash() {
  return (
    <View style={styles.splash}>
      <StatusBar style="dark" />
      <Carrot size={60} />
    </View>
  );
}

function Router() {
  const { session, ready, recoveryMode } = useSession();
  const route = useRoute();

  if (recoveryMode) {
    // Password recovery wins over route + session: the user opened a reset
    // link from email, the SDK swapped the token for a session, and now they
    // need to set a new password before doing anything else.
    return <Reset />;
  }
  if (route === "/legal") return <Legal />;
  if (route === "/contact") return <Contact />;
  if (!ready) return <Splash />;
  if (route === "/stats") {
    // Half-public: signed-in users get their personal breakdown (which needs
    // the store), signed-out visitors get the community numbers only. Sits
    // after the splash gate so a signed-in user never flashes the public
    // variant while the session loads.
    return session ? (
      <StoreProvider userId={session.user.id}>
        <Stats signedIn />
      </StoreProvider>
    ) : (
      <Stats signedIn={false} />
    );
  }
  if (!session) {
    // The marketing landing page is the entry point for signed-out visitors;
    // it owns the Google + email sign-in flows.
    return <Landing />;
  }
  return (
    <StoreProvider userId={session.user.id}>
      {route === "/settings" ? (
        <Settings />
      ) : route === "/safe" ? (
        <Safe />
      ) : route === "/history" ? (
        <History />
      ) : route === "/stats/treats" ? (
        <Receipts kind="treats" />
      ) : route === "/stats/weekend" ? (
        <Receipts kind="weekend" />
      ) : (
        <Home />
      )}
    </StoreProvider>
  );
}

export default function App() {
  // Grobold is the cartoon hijack; everything else is the platform font. Hold
  // the splash until it's in so the wordmark never flashes a fallback.
  const [fontsLoaded] = useFonts({
    Grobold: require("../assets/fonts/Grobold.ttf"),
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>{fontsLoaded ? <Router /> : <Splash />}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
});
