import React from "react";
import { createRoot } from "react-dom/client";
import { RecapScreen } from "../../src/screens/Recap";
import "../../src/index.css";
window.history.replaceState(null, "", "#/recap?month=2025-12");
createRoot(document.getElementById("root")!).render(
  <>
    <p style={{ textAlign: "center" }}>Fictional fixture · local QA only</p>
    <RecapScreen />
  </>,
);
