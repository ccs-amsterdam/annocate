"use client";
import { useRef } from "react";
import Popup from "@/components/Common/Popup";
import MenuButtonGroup from "../Annotator/components/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import { FaChevronRight, FaUser } from "react-icons/fa";
import styled from "styled-components";
import { useSelectedLayoutSegments } from "next/navigation";
import Link from "next/link";

interface MenuProps {}

export default function Menu() {
  const userButtonRef = useRef<HTMLDivElement>(null);
  const test = useSelectedLayoutSegments();

  const breadcrubs = ["home", ...test];

  function renderBreadcrumbs() {
    let path = "";
    return breadcrubs.map((x, i) => {
      path = path + "/" + x;
      if (i === breadcrubs.length - 1)
        return (
          <Breadcrumb key={x} $current>
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
    <StyledDiv>
      <ul className="Menu">
        <div key="left" className="LeftSide">
          {renderBreadcrumbs()}
        </div>
        <div key="right" className="RightSide">
          <MenuButtonGroup>
            <div>
              <DarkModeButton />
            </div>
            <div ref={userButtonRef}>
              <FaUser />
            </div>
          </MenuButtonGroup>
        </div>
      </ul>
      <Popup triggerRef={userButtonRef}>
        <div className="PopupContent"></div>
      </Popup>
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  width: 100%;
  max-width: 1200px;

  .Menu {
    display: flex;
    align-items: flex-start;
    list-style-type: none;
    margin: 0;
    padding: 3px 10px 0px 10px;
    gap: 1rem;
    font-size: 1.6rem;
    color: var(--text);
    min-height: 5rem;

    .LeftSide {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      min-height: 4rem;
      margin-top: 0.2rem;
    }

    .RightSide {
      color: var(--primary-text);
      padding-top: 5px;
      flex: 1 1 auto;
      display: flex;
      justify-content: flex-end;
    }

    li {
      cursor: pointer;
      padding: 1.5rem 0.5rem 0.5rem 0.5rem;

      &.active {
        border-bottom: 2px solid var(--primary);
      }
    }
  }

  .PopupContent {
    display: flex;
    flex-direction: column;

    padding: 1rem;
    font-size: 1.5rem;
    svg {
      margin-right: 1rem;
    }
    .authform {
      margin: auto;
      display: flex;
      justify-content: center;
    }
  }
`;

const Breadcrumb = styled.div<{ $current?: boolean }>`
  padding: 0.6rem 0.5rem 0.5rem 0.3rem;
  border-radius: 4px;
  color: var(--primary-text);

  a {
    color: var(--text);
    text-decoration: none;
    &:hover {
      color: var(--primary-text);
    }
  }
`;
