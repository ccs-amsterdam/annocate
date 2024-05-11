"use client";

import Menu from "@/components/Menu/Menu";
import { usePathname } from "next/navigation";

interface Props {
  children: React.ReactNode;
}

export function PageLayout({ children }: Props) {
  const path = usePathname();

  if (path?.startsWith("/annotator")) {
    return <AnnotatorLayout>{children}</AnnotatorLayout>;
  }
  return <ManagerLayout>{children}</ManagerLayout>;
}

export function AnnotatorLayout({ children }: Props) {
  return <div>{children}</div>;
}

export function ManagerLayout({ children }: Props) {
  return (
    <div className="k relative flex h-full w-full flex-col items-center">
      <header className="bg-menu border-primary-light sticky left-0 top-0 z-50 flex w-full justify-center border-b-[1px] backdrop-blur-md transition-all">
        <Menu />
      </header>

      <div className={"mt-10 h-full w-full max-w-[1000px]"}>{children}</div>
      <footer className={"mt-auto h-10 w-full"}></footer>
    </div>
  );
}
