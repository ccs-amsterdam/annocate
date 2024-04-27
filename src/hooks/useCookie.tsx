import { useState, useEffect } from "react";
import Cookies from "js-cookie";

function getCurrentValue(key: string, defaultValue: string): string {
  if (typeof window === "undefined") return defaultValue; // for nextjs serverside render
  const saved = Cookies.get(key);
  return saved ?? defaultValue;
}

export const useCookie = (key: string, defaultValue: any) => {
  const [value, setValue] = useState<string>(() => {
    return getCurrentValue(key, defaultValue);
  });

  useEffect(() => {
    Cookies.set(key, value);
  }, [key, value]);

  return [value, setValue];
};

export default useCookie;
