"use client";

import { RiFontSize2 } from "react-icons/ri";
import useCookie from "@/hooks/useCookie";
import useIsClient from "@/hooks/useIsClient";
import { Loader, Moon, Sun, SunMoon } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@radix-ui/themes";

function setDataset(dataset: string, value: string) {
  document.documentElement.dataset[dataset] = value;
}

export const DarkModeButton = () => {
  const [dark, setDark] = useCookie("dark", "off");
  const isClient = useIsClient();

  const onClick = () => {
    const next = dark === "on" ? "off" : "on";
    setDataset("dark", next);
    setDark(next);
  };

  let icon: ReactNode = null;

  if (!isClient) {
    icon = <SunMoon className="h-8 w-8 animate-spin-slow text-foreground/50" />;
  } else if (dark === "off") {
    icon = (
      <Sun
        role="button"
        className="h-8 w-8"
        onClick={onClick}
        style={{
          cursor: "pointer",
        }}
      />
    );
  } else {
    icon = (
      <Moon
        role="button"
        className="h-8 w-8"
        onClick={onClick}
        style={{
          cursor: "pointer",
        }}
      />
    );
  }

  return <Button>{icon}</Button>;
};

const fontsizes = ["small", "medium", "large"];

export const FontSizeButton = () => {
  const [fontsize, setFontsize] = useCookie("fontsize", "medium");
  const selected = fontsizes.findIndex((x) => x === fontsize);
  const isClient = useIsClient();

  const onClick = () => {
    const next = selected < fontsizes.length - 1 ? selected + 1 : 0;
    setDataset("fontsize", fontsizes[next]);
    setFontsize(fontsizes[next]);
  };

  if (!isClient) return <RiFontSize2 className="Rendering" />;
  return <RiFontSize2 onClick={onClick} />;
};
