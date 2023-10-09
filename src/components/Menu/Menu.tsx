"use client";
import MenuButtonGroup from "../Annotator/components/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import { FaChevronRight, FaUser } from "react-icons/fa";
import { useSelectedLayoutSegments } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "middlecat-react";
import RadixPopup from "../Common/RadixPopup";

export default function Menu() {
  const path = useSelectedLayoutSegments();
  const breadcrubs = ["home", ...path];

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
              fontSize: "1.3rem",
              transform: "translateY(2px)",
            }}
          />
        </Breadcrumb>
      );
    });
  }

  return (
    <menu className="w-full max-w-[1200px] px-2">
      <ul className="text-text m-0 flex min-h-[5rem] list-none items-start gap-2 px-3 pb-0 pt-1 text-2xl">
        <div key="left" className="mt-1 flex min-h-[4rem] flex-auto items-center ">
          {renderBreadcrumbs()}
        </div>
        <div key="right" className="text-primary-text flex flex-auto justify-end pt-[5px]">
          <MenuButtonGroup>
            <div>
              <DarkModeButton />
            </div>
            <RadixPopup trigger={<FaUser />} className="flex flex-col justify-center">
              <AuthForm signInTitle="" />
            </RadixPopup>
          </MenuButtonGroup>
        </div>
      </ul>
    </menu>
  );
}

const Breadcrumb = ({ children, current }: { current?: boolean; children: React.ReactNode }) => {
  return (
    <div className="text-primary-text rounded p-2">
      <a
        className={`text-text  flex no-underline ${
          current ? "text-primary-text" : "hover:text-primary-text"
        }`}
      >
        {children}
      </a>
    </div>
  );
};
