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
    <div className=" relative flex h-full w-full flex-col items-center">
      <header className="bg-menu left-0  top-0 z-0 flex h-[var(--header-height)] w-full justify-center border-b-[1px] border-primary-light  transition-all">
        <Menu />
      </header>

      <div className={"min-h-[calc(100vh-var(--header-height))] w-full"}>{children}</div>
    </div>
  );
}
