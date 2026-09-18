import { JobRunner } from "./lib/components/JobRunner";

// Standalone dev-app shell: runs the annotinder-client against a local
// mock-server (see packages/mock-server), using a per-browser persisted
// coder key + the seed demo job's invite secret. Real deployments should
// import { JobRunner } (or its building blocks) into a host app instead --
// see design plan §7.
const MOCK_SERVER_URL = import.meta.env.VITE_MOCK_SERVER_URL ?? "http://localhost:8787";

function getOrCreateCoderKey(): string {
  const storageKey = "annotinder-client:dev-coder-key";
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function App() {
  const coderKey = getOrCreateCoderKey();
  const inviteSecret = new URLSearchParams(window.location.search).get("invite") ?? "demo-secret";

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <JobRunner baseUrl={MOCK_SERVER_URL} coderKey={coderKey} inviteSecret={inviteSecret} />
    </div>
  );
}

export default App;
