"use client";

import GridList from "@/components/Common/GridList/GridList";
import { DataQuery } from "@/components/Common/GridList/GridListTypes";
import { StyledButton } from "@/styled/StyledSemantic";
import Link from "next/link";
import { useCallback, useEffect } from "react";
import styled from "styled-components";

const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  align-items: center;

  .Header {
    width: 280px;
    max-width: 100%;
    h2 {
      text-align: center;
    }
  }
`;

export default function ManageJobsGrid() {
  const loadData = useCallback(async (query: DataQuery) => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      return { data, meta: { offset: 0, total: data.length } };
    } catch (e: any) {
      console.error(e);
      return { data: [], meta: { offset: 0, total: 0 } };
    }
  }, []);

  return (
    <StyledDiv>
      <div className="Header">
        <h2>Manage Jobs</h2>
        <Link href="/home/manage/new">
          <StyledButton $fluid>Create new job</StyledButton>
        </Link>
      </div>
      <GridList
        loadData={loadData}
        template={template}
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        noResultsText="No jobs found"
      />
    </StyledDiv>
  );
}

const template: GridItemTemplate[] = [
  {
    label: "ID",
    value: "id",
    style: { fontWeight: "bold", fontSize: "1.6rem" },
  },
  {
    label: "Coding Job",
    value: "title",
    style: { fontWeight: "bold", fontSize: "1.3rem" },
  },
];

const sortOptions: SortQueryOption[] = [
  { variable: "modified", label: "Last activity", default: "desc" },
  { variable: "progress", label: "% Completed" },
];

const filterOptions: FilterQueryOption[] = [
  { variable: "title", label: "Coding Job Title", type: "search" },
];
