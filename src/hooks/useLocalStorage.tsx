import { useState, useEffect } from "react";
// https://blog.logrocket.com/using-localstorage-react-hooks/

function getStorageValue(key: string, defaultValue: any): any {
  // getting stored value
  if (typeof window === "undefined") return defaultValue; // for nextjs serverside render
  const saved = localStorage.getItem(key);
  const initial = saved ? JSON.parse(saved) : undefined;
  return initial ?? defaultValue;
}

export const useLocalStorage = (key: string, defaultValue: any) => {
  const [value, setValue] = useState(() => {
    return getStorageValue(key, defaultValue);
  });

  useEffect(() => {
    // storing input name
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

export default useLocalStorage;
