import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Carrot } from "@/components/ui/Carrot";
import { Login } from "@/screens/Login";
import { Home } from "@/screens/Home";
import { Settings } from "@/screens/Settings";

function Splash() {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden">
      <div
        aria-hidden
        className="lt-rings absolute left-1/2 top-1/2 h-[150vmin] w-[150vmin] -translate-x-1/2 -translate-y-1/2 opacity-60"
      />
      <Carrot className="relative text-6xl" animation="hop" />
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
      {route === "/settings" ? <Settings /> : <Home />}
    </StoreProvider>
  );
}
