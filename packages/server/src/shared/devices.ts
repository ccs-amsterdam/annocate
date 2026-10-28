// Coarse device details from a browser's user agent (docs/coder-identity.md
// §4): the kind of device, browser and operating system, as survey tools
// report them. Not the user agent itself: that is close to a fingerprint.

export interface DeviceDetails {
  type: "phone" | "tablet" | "desktop" | null;
  browser: string | null;
  os: string | null;
}

export function deviceDetails(userAgent: string | undefined): DeviceDetails {
  const ua = userAgent ?? "";
  if (!ua) return { type: null, browser: null, os: null };
  const type = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "phone" : "desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "other";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "other";
  return { type, browser, os };
}
