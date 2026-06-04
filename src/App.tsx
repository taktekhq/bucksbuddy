import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Carrot } from "@/components/ui/Carrot";
import { Login } from "@/screens/Login";
import { Landing } from "@/screens/Landing";
import { Privacy, Terms } from "@/screens/Legal";
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

// With the iOS status bar set to black-translucent, the page shows behind the
// clock/battery but their icons are forced white. This subtle darkening in just
// the notch area keeps them legible on light screens (and is invisible on the
// dark Safe). Height collapses to 0 on devices without a top inset.
function StatusBarScrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0"
      style={{
        height: "var(--safe-top)",
        zIndex: 60,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0))",
      }}
    />
  );
}

export default function App() {
  const { session, ready } = useSession();
  const route = useRoute();

  let content;
  if (route === "/home") {
    // The public landing page lives behind "/home" for now, and is previewable
    // regardless of auth state — its CTA hands off to the Login screen.
    content = <Landing />;
  } else if (route === "/privacy") {
    // Public legal pages — viewable signed-in or out.
    content = <Privacy />;
  } else if (route === "/terms") {
    content = <Terms />;
  } else if (!ready) {
    content = <Splash />;
  } else if (!session) {
    content = <Login />;
  } else {
    content = (
      <StoreProvider userId={session.user.id}>
        {route === "/settings" ? (
          <Settings />
        ) : route === "/safe" ? (
          <Safe />
        ) : (
          <Home />
        )}
      </StoreProvider>
    );
  }

  return (
    <>
      <StatusBarScrim />
      {content}
    </>
  );
}
