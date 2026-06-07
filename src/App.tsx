import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Carrot } from "@/components/ui/Carrot";
import { Landing } from "@/screens/Landing";
import { Legal } from "@/screens/Legal";
import { Contact } from "@/screens/Contact";
import { Home } from "@/screens/Home";
import { History } from "@/screens/History";
import { Settings } from "@/screens/Settings";
import { Safe } from "@/screens/Safe";
import { Reset } from "@/screens/Reset";

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
  const { session, ready, recoveryMode } = useSession();
  const route = useRoute();

  let content;
  if (recoveryMode) {
    // Password recovery wins over route + session: the user clicked a reset
    // link from email, the SDK swapped the token for a session, and now they
    // need to set a new password before doing anything else. Without that
    // event having fired, this screen never renders (see useSession).
    content = <Reset />;
  } else if (route === "/legal") {
    // Public privacy + terms page — viewable signed-in or out.
    content = <Legal />;
  } else if (route === "/contact") {
    // Public contact page — viewable signed-in or out.
    content = <Contact />;
  } else if (!ready) {
    content = <Splash />;
  } else if (!session) {
    // The marketing landing page is the entry point for signed-out visitors;
    // it owns the Google + email sign-in flows.
    content = <Landing />;
  } else {
    content = (
      <StoreProvider userId={session.user.id}>
        {route === "/settings" ? (
          <Settings />
        ) : route === "/safe" ? (
          <Safe />
        ) : route === "/history" ? (
          <History />
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
