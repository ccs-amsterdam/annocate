export interface StudyRunnerProps {
  /** Server URL including the deployment, e.g. `/api/d/k3v9x2m4q7ta` (same origin as the client). */
  baseUrl: string;
  linkSecret?: string;
  /** The page's other query parameters: the coder id and the design's URL parameters (the server stores the ones it needs when the coder starts). */
  urlParams?: Record<string, string>;
  /** The coder chose to code with their account: a login in the browser counts for the session (`x-use-login`). */
  useLogin?: boolean;
  /** Token from a "Continue on another device" link: redeemed for the session's coder key. */
  transferToken?: string;
  /** Called once a transfer token was redeemed, e.g. to remove it from the URL. */
  onTransferRedeemed?: () => void;
  /** Builds the link shown for "Continue on another device". Defaults to this page with `?transfer=<token>`. */
  transferUrl?: (token: string) => string;
  preview?: boolean;
  /** Start a new session rather than continue this browser's (e.g. resetting a preview). */
  newSession?: boolean;
  /** The coder's overview of their studies, linked from the end screen. */
  homeUrl?: string;
}

export interface CodingScreenProps extends StudyRunnerProps {
  newSession: boolean;
  /** This device joined the session by a transfer link, just now. */
  joinedByTransfer: boolean;
  onStartNewSession: () => void;
  /** On a pick-your-name link: the name picked, and picking (again). */
  coderName?: string;
  onPickName: (name: string) => void;
}
