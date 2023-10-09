"use client";
import { Button } from "@/styled/StyledSemantic";
import { useMiddlecat } from "middlecat-react";
import Link from "next/link";
import styled from "styled-components";

export default function Home() {
  const { user, loading, signIn, signOut } = useMiddlecat();

  return (
    <StyledDiv>
      <div className="Container">
        <h3>What are you here for?</h3>

        <div className="Nav">
          <Link href="/home/manage">
            <Button $primary $fluid>
              Annotate
            </Button>
          </Link>
          <Link href="/home/manage">
            <Button $secondary $fluid>
              Manage jobs
            </Button>
          </Link>
        </div>
      </div>
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;

  .Container {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .Nav {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem;

    a {
      width: 200px;
    }
  }
`;
