"use client";
import { useEffect } from "react";

// somehow, taking the full height/width sometimes causes overflows.
// subtracing 1 seems to work, but I can't explain why (maybe some rogue border)
const darkmass = 1;

export default function SetResponsiveSize() {
  useEffect(() => {
    // only on client
    if (!window?.visualViewport) return;

    // Listen for changes to screen size and orientation
    // (this would have been so much easier if Safari would support window.screen.orientation)
    window.visualViewport.addEventListener("resize", updateSize);
    window.addEventListener("resize", updateSize);

    if (window?.screen?.orientation) window.screen.orientation?.addEventListener("change", updateSize);
    return () => {
      if (!window?.visualViewport) return;
      window.visualViewport.removeEventListener("resize", updateSize);
      window.removeEventListener("resize", updateSize);
      if (window?.screen?.orientation) window.screen.orientation.removeEventListener("change", updateSize);
    };
  }, []);

  useEffect(() => {
    // listening for orientation and size changes doesn't always work and on some devices
    // size isn't properly set on mount. Therefore also just check the size repeatedly
    const interval = setInterval(() => updateSize(), 1000);
    return () => clearInterval(interval);
  }, []);

  return <></>;
}

function updateSize() {
  // use window.innerHeight for height, because vh on mobile is weird (can include the address bar)
  // use document.documentElement.clientwidth for width, to exclude the scrollbar
  const height = `${window.innerHeight - darkmass}px`;
  const width = `${document.documentElement.clientWidth - darkmass}px`;

  const currentHeight = document.documentElement.style.getPropertyValue(`--responsive-height`);
  const currentWidth = document.documentElement.style.getPropertyValue(`--responsive-width`);

  if (height !== currentHeight || width !== currentWidth) {
    document.documentElement.style.setProperty(`--responsive-height`, height);
    document.documentElement.style.setProperty(`--responsive-width`, width);
  }
}
