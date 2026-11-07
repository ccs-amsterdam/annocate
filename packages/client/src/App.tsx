import { CollapsibleHeader, CollapsingChrome } from "./lib/hooks/useCollapsingChrome";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import type { AuthOptions, MeResponse } from "@annotinder/contracts";
import { AdminApp, TAB_SLUGS, type AdminLocation, type LeaveGuard, type TabId } from "./lib/components/admin/AdminApp";
import { ResearcherGate } from "./lib/components/admin/account/ResearcherGate";
import { AccountMenu } from "./lib/components/admin/account/AccountMenu";
import { HttpResearcherApi } from "./lib/api/httpResearcherApi";
import { ServerApi } from "./lib/api/serverApi";
import { useTheme } from "./lib/context/theme";
import { WelcomePage } from "./pages/WelcomePage";
import { CodeHomePage } from "./pages/CodeHomePage";
import { CodePage } from "./pages/CodePage";

// The app (docs/client.md): a welcome page, the researcher section
// (/research) and the coder section (/code). The server serves it
// for every path outside /api (docs/hosting.md), on its own origin
// (session cookies are same-origin only); in development Vite serves it
// and forwards /api (vite.config.ts).
const API_URL = "/api";

/** Logged-in researchers: the session cookie. */
const sessionApi = new HttpResearcherApi({ baseUrl: API_URL });
/** A server without login but with development auth (`pnpm dev` without OIDC settings). */
const devApi = new HttpResearcherApi({ baseUrl: API_URL, devRole: "ADMIN", devEmail: "dev@example.com" });
const servers = new Map([sessionApi, devApi].map((api) => [api, new ServerApi(api)]));

type Researcher = { state: { options: AuthOptions; me: MeResponse | null } | null; dev: boolean; api: HttpResearcherApi };

/**
 * Who is using the app as a researcher: a logged-in researcher (session
 * cookie), the development user (a server without login but with
 * development auth), or nobody yet (`me` null). Asked once, for the header too.
 */
function useResearcherState(): Researcher {
  const [state, setState] = useState<Researcher["state"]>(null);
  useEffect(() => {
    void (async () => {
      const options = await sessionApi.getAuthOptions().catch(() => ({ login: false, devAuth: false }));
      const api = !options.login && options.devAuth ? devApi : sessionApi;
      const me = await api.getMe().catch(() => null);
      setState({ options, me });
    })();
  }, []);
  const dev = state !== null && !state.options.login && state.options.devAuth;
  return { state, dev, api: dev ? devApi : sessionApi };
}

const ResearcherContext = createContext<Researcher | null>(null);
const useResearcher = () => useContext(ResearcherContext)!;

/** The app's header (not on coding screens): home, the two sections, the account. */
function AppHeader() {
  const researcher = useResearcher();
  const nav = "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  const active = { className: "bg-muted text-foreground" };
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 shadow-sm">
      <div className="flex flex-1 items-center gap-3">
        <Link to="/" className="flex items-center gap-2" aria-label="AnnoTinder home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">A</span>
          <span className="hidden font-heading text-lg font-bold tracking-tight text-foreground sm:inline">AnnoTinder</span>
        </Link>
        {researcher.dev && <span className="hidden rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground sm:inline">dev mode</span>}
      </div>
      <nav className="flex items-center gap-1" aria-label="Sections">
        <Link to="/research" className={nav} activeProps={active}>
          Research
        </Link>
        <Link to="/code" activeOptions={{ exact: true }} className={nav} activeProps={active}>
          Code
        </Link>
      </nav>
      <div className="flex flex-1 justify-end">
        {researcher.state && (
          <AccountMenu client={researcher.api} me={researcher.state.me} dev={researcher.dev} canLogIn={researcher.state.options.login} />
        )}
      </div>
    </header>
  );
}

/** A page with the app's header. */
function WithHeader({ children }: { children: ReactNode }) {
  // Scrolling down anywhere on the page hides the headers; scrolling up shows them (useCollapsingChrome)
  return (
    <CollapsingChrome className="flex h-screen flex-col overflow-clip bg-background text-foreground">
      <CollapsibleHeader>
        <AppHeader />
      </CollapsibleHeader>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </CollapsingChrome>
  );
}

function Root() {
  // The researcher pages follow the theme too (the coding screen applies it itself).
  useTheme();
  const researcher = useResearcherState();
  return (
    <ResearcherContext.Provider value={researcher}>
      <Outlet />
    </ResearcherContext.Provider>
  );
}

/** Asks before leaving the editor with unsaved edits (the router's blocker; the editor shows its dialog). */
const useRouterLeaveGuard: LeaveGuard = (when) => {
  const blocker = useBlocker({
    // Leaving the page; changing its search (e.g. the editor's version) is the editor's own business
    shouldBlockFn: ({ current, next }) => when && current.pathname !== next.pathname,
    enableBeforeUnload: when,
    withResolver: true,
  });
  return {
    blocked: blocker.status === "blocked",
    proceed: () => blocker.proceed?.(),
    stay: () => blocker.reset?.(),
  };
};

const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab as TabId])) as Record<string, TabId>;

/** The researcher section: behind a login if the server has one, else with development headers. */
function ResearchPage({ location }: { location: AdminLocation }) {
  const researcher = useResearcher();
  const navigate = useNavigate();
  if (!researcher.state) return null;
  const onNavigate = (to: AdminLocation, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false;
    if (to.page === "studies") void navigate({ to: "/research", replace });
    else if (to.page === "server") void navigate({ to: "/research/admin", replace });
    else
      void navigate({
        to: "/research/studies/$studyId/$tab",
        params: { studyId: String(to.studyId), tab: TAB_SLUGS[to.tab] },
        search: to.version !== undefined ? { version: String(to.version) } : {},
        replace,
      });
  };
  const admin = (api: HttpResearcherApi, who: MeResponse | null) => (
    <AdminApp
      client={api}
      coderApiUrl={API_URL}
      server={servers.get(api)}
      me={who}
      location={location}
      onNavigate={onNavigate}
      useLeaveGuard={useRouterLeaveGuard}
    />
  );
  return (
    <WithHeader>
      <div className="flex h-full flex-col overflow-hidden">
        {researcher.dev ? admin(devApi, researcher.state.me) : <ResearcherGate client={sessionApi}>{(who) => admin(sessionApi, who)}</ResearcherGate>}
      </div>
    </WithHeader>
  );
}

/**
 * The researcher section's layout: one researcher UI for all its pages (it
 * keeps its state, e.g. unsaved edits to continue with), at the place the
 * URL says. Its child routes only name the URLs.
 */
function ResearchLayout() {
  const { pathname, search } = useLocation();
  const parts = pathname.replace(/\/+$/, "").split("/").slice(2);
  let location: AdminLocation = { page: "studies" };
  if (parts[0] === "admin") location = { page: "server" };
  else if (parts[0] === "studies" && Number(parts[1]) > 0) {
    const version = Number((search as StringSearch).version);
    location = { page: "study", studyId: Number(parts[1]), tab: SLUG_TABS[parts[2]] ?? "Overview", ...(Number.isInteger(version) && version > 0 ? { version } : {}) };
  }
  return <ResearchPage location={location} />;
}

/** Search parameters as plain strings (a participant id "007" stays "007"). */
type StringSearch = Record<string, string>;
const stringSearch = (search: Record<string, unknown>): StringSearch =>
  Object.fromEntries(Object.entries(search).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

const rootRoute = createRootRoute({ component: Root });
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <WithHeader>
      <WelcomePage />
    </WithHeader>
  ),
});
const researchRoute = createRoute({ getParentRoute: () => rootRoute, path: "/research", component: ResearchLayout });
const researchIndexRoute = createRoute({ getParentRoute: () => researchRoute, path: "/" });
const serverAdminRoute = createRoute({ getParentRoute: () => researchRoute, path: "/admin" });
const studyRoute = createRoute({
  getParentRoute: () => researchRoute,
  path: "/studies/$studyId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/research/studies/$studyId/$tab", params: { studyId: params.studyId, tab: "overview" }, replace: true });
  },
});
const studyTabRoute = createRoute({
  getParentRoute: () => researchRoute,
  path: "/studies/$studyId/$tab",
  validateSearch: (search: Record<string, unknown>): { version?: string } => (typeof search.version === "string" ? { version: search.version } : {}),
});
const codeHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/code",
  component: function CodeHome() {
    return (
      <WithHeader>
        <CodeHomePage apiUrl={API_URL} dev={useResearcher().dev} />
      </WithHeader>
    );
  },
});
const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/code/$deployment",
  validateSearch: stringSearch,
  component: function Code() {
    const { deployment } = useParams({ from: "/code/$deployment" });
    const search = useSearch({ from: "/code/$deployment" });
    const navigate = useNavigate();
    return (
      <CodePage
        deployment={deployment}
        apiUrl={API_URL}
        search={search}
        onTransferRedeemed={() => {
          const rest = { ...search };
          delete rest.transfer;
          void navigate({ to: "/code/$deployment", params: { deployment }, search: rest, replace: true });
        }}
      />
    );
  },
});

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  researchRoute.addChildren([researchIndexRoute, serverAdminRoute, studyRoute, studyTabRoute]),
  codeHomeRoute,
  codeRoute,
]);

export const router = createRouter({
  routeTree,
  // Plain query strings: values stay strings, as typed in a link
  parseSearch: (searchStr) => Object.fromEntries(new URLSearchParams(searchStr)),
  stringifySearch: (search) => {
    const query = new URLSearchParams(stringSearch(search)).toString();
    return query ? `?${query}` : "";
  },
  defaultNotFoundComponent: () => (
    <WithHeader>
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-heading text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link to="/" className="underline">
            Go to the start page
          </Link>
        </p>
      </div>
    </WithHeader>
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
