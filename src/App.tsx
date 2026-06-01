import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Login } from "@/screens/Login";
import { Home } from "@/screens/Home";
import { Add } from "@/screens/Add";
import { Settings } from "@/screens/Settings";

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <span className="animate-pulse text-5xl">🥕</span>
    </div>
  );
}

export default function App() {
  const { session, ready } = useSession();
  const route = useRoute();

  if (!ready) return <Splash />;
  if (!session) return <Login />;

  return (
    <StoreProvider userId={session.user.id}>
      {route === "/add" ? <Add /> : route === "/settings" ? <Settings /> : <Home />}
    </StoreProvider>
  );
}
