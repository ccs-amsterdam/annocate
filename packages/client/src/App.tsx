import { ANNOTINDER_CLIENT_VERSION } from "./lib";

// Standalone dev-app shell. Used for local development against the mock
// server (see packages/mock-server). Phase 3+ will replace this placeholder
// with the real job/session bootstrap flow.
function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p>annotinder-client dev app (v{ANNOTINDER_CLIENT_VERSION})</p>
    </div>
  );
}

export default App;
