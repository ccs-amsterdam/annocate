"use client";

import useIsClient from "@/hooks/useIsClient";
import useLocalStorage from "@/hooks/useLocalStorage";
import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

function setDataset(dataset: string, value: string) {
  if (typeof window === "undefined") return;
  document.documentElement.dataset[dataset] = value;
}

export const useDarkMode = () => {
  const [ls, setLs] = useLocalStorage("dark", "off");
  const isClient = useIsClient();

  const setDark = (bool: true) => {
    const mode = bool ? "on" : "off";
    setDataset("dark", mode);
    setLs(mode);
  };

  const dark = isClient ? ls === "on" : false;
  console.log("in hook", dark);
  return [dark, setDark] as const;
};

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

  return (
    <Button variant="ghost" size="icon">
      {icon}
    </Button>
  );
};
