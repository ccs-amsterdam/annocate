"use client";
import { useRef } from "react";
import Popup from "@/components/Common/Popup";
import MenuButtonGroup from "../Annotator/components/MenuButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import { FaUser } from "react-icons/fa";
import styled from "styled-components";

interface MenuProps {}

export default function Menu() {
  const userButtonRef = useRef<HTMLDivElement>(null);

  return (
    <StyledDiv>
      <ul className="Menu">
        <div className="RightSide">
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
  .Menu {
    display: flex;
    align-items: center;
    list-style-type: none;
    margin: 0;
    padding: 3px 10px 0px 10px;
    gap: 1rem;
    font-size: 1.6rem;
    color: var(--text);

    .RightSide {
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
