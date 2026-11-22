import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// The font from JavaScript: Vite bundles its files (an @import in the Tailwind CSS left them out)
import "@fontsource-variable/geist";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
