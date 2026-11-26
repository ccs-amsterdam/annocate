import { describe, expect, it, vi } from "vitest";
import { afterLogout } from "./afterLogout";

const fakeLocation = () => ({ assign: vi.fn(), reload: vi.fn() });

describe("afterLogout", () => {
  it("goes to the login provider to end its session too, when the server says where", () => {
    const location = fakeLocation();
    const onLoggedOut = vi.fn();
    afterLogout("https://idp.test/logout?id_token_hint=t", onLoggedOut, location);
    expect(location.assign).toHaveBeenCalledWith("https://idp.test/logout?id_token_hint=t");
    expect(onLoggedOut).not.toHaveBeenCalled();
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("otherwise stays: onLoggedOut, or a reload without one", () => {
    const location = fakeLocation();
    const onLoggedOut = vi.fn();
    afterLogout(null, onLoggedOut, location);
    expect(onLoggedOut).toHaveBeenCalledOnce();
    afterLogout(null, undefined, location);
    expect(location.reload).toHaveBeenCalledOnce();
    expect(location.assign).not.toHaveBeenCalled();
  });
});
