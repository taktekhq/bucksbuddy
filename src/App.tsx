import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { useRoute } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { Carrot } from "@/components/ui/Carrot";
import { TabBar, type Tab } from "@/components/ui/TabBar";
import { Login } from "@/screens/Login";
import { Add } from "@/screens/Add";
import { Summary } from "@/screens/Summary";
import { Settings } from "@/screens/Settings";
import type { Transaction } from "@/types/db";

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Carrot className="text-6xl" />
    </div>
  );
}

// Authenticated shell: two tabs (Add = the dial, Summary = money + history),
// with editing lifted here so a History row can load into the dial and switch
// to the Add tab.
function Main() {
  const [tab, setTab] = useState<Tab>("add");
  const [editing, setEditing] = useState<Transaction | null>(null);

  function startEdit(tx: Transaction) {
    setEditing(tx);
    setTab("add");
  }

  function switchTab(next: Tab) {
    setEditing(null); // a manual tab switch is a fresh entry
    setTab(next);
  }

  return (
    <div className="min-h-full pb-[calc(4rem+var(--safe-bottom))]">
      {tab === "add" ? (
        <Add
          editing={editing}
          onClearEdit={() => {
            setEditing(null);
            setTab("summary");
          }}
        />
      ) : (
        <Summary onEdit={startEdit} />
      )}
      <TabBar tab={tab} onChange={switchTab} />
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
      {route === "/settings" ? <Settings /> : <Main />}
    </StoreProvider>
  );
}
