"use client";
import { Button } from "@/styled/StyledSemantic";
import Link from "next/link";
import styled from "styled-components";

export default function Home() {
  return (
    <StyledDiv>
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
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

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
