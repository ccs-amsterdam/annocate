import { useEffect } from "react";

export default function useScrollState() {
  useEffect(() => {
    let hasScrolled = false;

    function setScrollProperties() {
      const scrolledDown = window.scrollY > 0;
      document.documentElement.style.setProperty("--nav-border-height", scrolledDown ? "1px" : "0px");
    }

    window.addEventListener("scroll", setScrollProperties);
    return () => {
      window.removeEventListener("scroll", setScrollProperties);
    };
  }, []);
}
