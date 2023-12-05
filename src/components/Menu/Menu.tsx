"use client";

import MenuButtonGroup from "../Annotator/components/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import { FaChevronRight, FaUser } from "react-icons/fa";
import { useSelectedLayoutSegments } from "next/navigation";
import Link from "next/link";
import { AuthForm, useMiddlecat } from "middlecat-react";
import RadixPopup from "../Common/RadixPopup";
import { Button } from "@/styled/StyledSemantic";
import { useState, useEffect } from "react";

export default function Menu() {
  const path = useSelectedLayoutSegments();
  const breadcrubs = ["home", ...path];
  const { user, loading, signIn, signOut, fixedResource } = useMiddlecat();
  const [showBreadcrumb, setShowBreadcrumb] = useState(true);

  useEffect(() => setShowBreadcrumb(true), []);

  function renderBreadcrumbs() {
    let path = "";
    return breadcrubs.map((x, i) => {
      path = path + "/" + x;
      if (i === breadcrubs.length - 1)
        return (
          <Breadcrumb key={x} current={true}>
            {x}
          </Breadcrumb>
        );
      return (
        <Breadcrumb key={x + i}>
          <Link href={path}>{x}</Link>
          <FaChevronRight
            key={"next" + x + i}
            style={{
              marginLeft: "1rem",
              fontSize: "0.8rem",
              transform: "translateY(8px)",
            }}
          />
        </Breadcrumb>
      );
    });
  }

  console.log(user);
  function renderAuth() {
    if (loading) return null;
    if (user?.email)
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 fill-background-inversed-fixed">
            <img src={user.image} alt="profile" className="h-7 w-7 rounded" referrerPolicy="no-referrer" />
            {user.name || user.email}
          </div>
          <Button $primary $fluid className="ml-auto mt-10" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      );
    return (
      <Button $primary $fluid onClick={() => signIn(fixedResource)}>
        Sign in
      </Button>
    );
  }

  return (
    <menu className="w-full px-2">
      <ul className="m-0 flex min-h-[3.8rem] list-none items-start gap-2 px-3 pb-0 pt-1 text-xl text-text">
        <div key="left" className="mt-1 flex min-h-[3rem] flex-auto items-center ">
          {showBreadcrumb ? renderBreadcrumbs() : null}
        </div>
        <div key="right" className="flex flex-auto justify-end pt-[5px] text-primary-text">
          <MenuButtonGroup>
            <div>
              <DarkModeButton />
            </div>
            <RadixPopup trigger={<FaUser />} className="flex min-w-[12rem] flex-col justify-center p-4">
              {renderAuth()}
            </RadixPopup>
          </MenuButtonGroup>
        </div>
      </ul>
    </menu>
  );
}

const Breadcrumb = ({ children, current }: { current?: boolean; children: React.ReactNode }) => {
  return (
    <div className="rounded p-2 text-primary-text">
      <span className={`flex  text-text no-underline ${current ? "text-primary-text" : "hover:text-primary-text"}`}>
        {children}
      </span>
    </div>
  );
};
