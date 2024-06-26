import { useEffect } from "react";
import { scrollToMiddle } from "@/functions/scroll";
import { FieldRefs } from "@/app/types";

interface FocusOverlayProps {
  fieldRefs: FieldRefs;
  focus: string[] | undefined;
  containerRef: any;
}

const FocusOverlay = ({ fieldRefs, focus, containerRef }: FocusOverlayProps) => {
  useEffect(() => {
    let first = true;
    for (const field of Object.keys(fieldRefs)) {
      if (!fieldRefs[field].current) continue;
      let nomatch = true;
      const cl = fieldRefs[field].current.classList;
      for (let f of focus || []) {
        const fieldWithoutNr = field.replace(/[.][0-9]+$/, "");
        if (f === field || f === fieldWithoutNr) {
          nomatch = false;
          cl.add("overlayFocus");
          if (first) {
            containerRef.current.style.scrollBehavior = "smooth";
            setTimeout(() => scrollToMiddle(containerRef.current, fieldRefs[field].current, 1 / 3), 50);
            setTimeout(() => scrollToMiddle(containerRef.current, fieldRefs[field].current, 1 / 3), 500);
            first = false;
          }
        }
      }
      if (nomatch) cl.remove("overlayFocus");
    }
  });

  if (!focus || focus.length === 0) return null;
  return <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-full bg-background/50"></div>;
};

export default FocusOverlay;
