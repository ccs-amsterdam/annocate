import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// https://dev.to/noclat/fixing-too-many-connections-errors-with-database-clients-stacking-in-dev-mode-with-next-js-3kpm
export function registerService(name: string, initFn: any) {
  const anyGlobal = global as any;
  if (process.env.NODE_ENV === "development") {
    if (!(name in global)) {
      anyGlobal[name] = initFn();
    }
    return anyGlobal[name];
  }
  return initFn();
}
