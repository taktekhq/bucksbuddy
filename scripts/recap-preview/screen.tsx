// The whole Recap room, over the stand-in store. Pick a scenario with
// ?scenario=food|locked|error|loading and a month with #/recap?month=YYYY-MM.
import { createRoot } from "react-dom/client";
import { Recap } from "@/screens/Recap";
import "@/index.css";

createRoot(document.getElementById("root")!).render(<Recap />);
