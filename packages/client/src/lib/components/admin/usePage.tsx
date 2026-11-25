import { useState, type ReactNode } from "react";
import { Pager } from "./Pager";

/** Rows per page of the long tables (coders, sessions, links): thousands of rows at once make a page slow. */
const PAGE_SIZE = 100;

/**
 * One page of a long list, and its pager (nothing when all fit on one page).
 * The page stays where it is when the list is refreshed; it moves back when
 * the list got shorter than where it was.
 */
export function usePage<T>(items: T[], pageSize = PAGE_SIZE): { rows: T[]; pager: ReactNode } {
  const [offset, setOffset] = useState(0);
  const lastPage = Math.max(0, Math.floor((items.length - 1) / pageSize) * pageSize);
  const start = Math.min(offset, lastPage);
  return {
    rows: items.slice(start, start + pageSize),
    pager: <Pager offset={start} total={items.length} pageSize={pageSize} onOffsetChange={setOffset} />,
  };
}
