import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "../styles.css";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { captureReferral } from "../lib/referral";
import { App } from "./App";

captureReferral(); // a ?ref= link counts even if the visitor buys later

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
