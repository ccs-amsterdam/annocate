"use client";

import { RiFontSize2 } from "react-icons/ri";
import useIsClient from "@/hooks/useIsClient";
import { Loader, Moon, Sun, SunMoon } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { Button } from "@radix-ui/themes";
import useLocalStorage from "@/hooks/useLocalStorage";

function setDataset(dataset: string, value: string) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset[dataset] = value;
}

export const DarkModeButton = () => {
  const [dark, setDark] = useLocalStorage("dark", "off");
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
