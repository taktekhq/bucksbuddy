import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { canUseSafe } from "@/lib/features";
import { Carrot } from "@/components/ui/Carrot";
import { Login } from "@/screens/Login";
import { Home } from "@/screens/Home";
import { Settings } from "@/screens/Settings";
import { Safe } from "@/screens/Safe";

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Carrot className="text-6xl" />
    </div>
  );
}

export default function App() {
  const { session, ready } = useSession();
  const route = useRoute();

  if (!ready) return <Splash />;
  if (!session) return <Login />;

  const email = session.user.email ?? null;
  // The /safe route is gated; non-allowlisted users fall through to Home.
  const showSafe = route === "/safe" && canUseSafe(email);

  return (
    <StoreProvider userId={session.user.id} userEmail={email}>
      {route === "/settings" ? (
        <Settings />
      ) : showSafe ? (
        <Safe />
      ) : (
        <Home />
      )}
    </StoreProvider>
  );
}
