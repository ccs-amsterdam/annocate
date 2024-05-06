"use client";

import { useEffect, useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa";
import { RiFontSize2 } from "react-icons/ri";
import useCookie from "@/hooks/useCookie";
import useIsClient from "@/hooks/useIsClient";
import { Loader } from "lucide-react";

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

  if (!isClient) return <FaSun className="animate-spin-slow text-foreground/50" />;

  if (dark === "off")
    return (
      <FaSun
        onClick={onClick}
        style={{
          cursor: "pointer",
        }}
      />
    );
  return (
    <FaMoon
      onClick={onClick}
      style={{
        cursor: "pointer",
      }}
    />
  );
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
