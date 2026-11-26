/**
 * What the browser does once AnnoTinder's session has ended: on to the login
 * provider to end its session too, when the server returned where
 * (`redirect`, OIDC RP-Initiated Logout); else `onLoggedOut`, or a reload.
 */
export function afterLogout(
  redirect: string | null,
  onLoggedOut?: () => void,
  location: Pick<Location, "assign" | "reload"> = window.location,
): void {
  if (redirect) location.assign(redirect);
  else if (onLoggedOut) onLoggedOut();
  else location.reload();
}
