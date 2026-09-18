import { RefObject, useEffect, useState } from "react";

export function useHeight(ref: RefObject<HTMLDivElement | null>, watch?: any) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let timer: any;
    function handleResize() {
      timer = setTimeout(() => {
        if (ref.current) {
          setHeight(ref.current.clientHeight);
        }
      }, 500);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [ref, watch]);

  return height;
}
