"use client";

import Link from "next/link";
import styled from "styled-components";

const StyledDiv = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export default function Job() {
  return (
    <main>
      <StyledDiv>
        <Link href="/">back</Link>
      </StyledDiv>
    </main>
  );
}
