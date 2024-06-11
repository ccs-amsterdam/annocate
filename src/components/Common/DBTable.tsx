import { Paginate } from "@/app/api/queryHelpers";
import { CheckCircle, ChevronLeft, ChevronRight, Circle, Loader, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loading } from "../ui/loader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { z } from "zod";
import { GetMetaSchema } from "@/app/api/schemaHelpers";

type Value = string | number | Date | boolean | string[] | object;

interface Props<T> {
  data?: T[];
  meta?: z.infer<typeof GetMetaSchema>;
  paginate: Paginate;
  sortBy: (column: string, direction: "asc" | "desc") => void;
  search: (query: string) => void;
  hasSearch: boolean;
  isLoading: boolean;
  columns?: string[];
  className?: string;
  onSelect?: (row: T) => void;
}

export default function DBTable<T extends Record<string, Value>>(props: Props<T>) {
  const [prevProps, setPrevProps] = useState(props);

  useEffect(() => {
    if (props.data) setPrevProps(props);
  }, [props]);

  const showPagination = props.hasSearch || (prevProps.meta && prevProps.meta.rows > prevProps.meta.pageSize);
  console.log(props.data);
  return (
    <div className={props.className || ""}>
      <div className={` mb-4 flex select-none gap-3  ${showPagination ? "" : "hidden"}`}>
        <DBSearch search={props.search} isLoading={props.isLoading} />
        <DBPagination paginate={props.paginate} />
      </div>
      <RenderTable {...prevProps} />
    </div>
  );
}

function RenderTable<T extends Record<string, Value>>({ data, meta, sortBy, onSelect, isLoading, columns }: Props<T>) {
  const cols = columns || Object.keys(data?.[0] || {});

  if (isLoading) return <Loading />;
  if (!data || !meta) return null;
  if (data.length === 0) return <div className="mt-5">No data found</div>;

  function renderSortChevron(column: string) {
    if (!meta?.sort || column !== meta.sort) return <FaChevronUp className="opacity-0 group-hover:opacity-100" />;
    if (column !== meta.sort) return null;
    if (meta.direction === "asc") return <FaChevronUp />;
    return <FaChevronDown />;
  }

  function onSort(column: string): void {
    if (!meta?.sort) return;
    if (column === meta.sort) {
      sortBy(column, meta.direction === "asc" ? "desc" : "asc");
    } else {
      sortBy(column, "asc");
    }
  }

  return (
    <Table className={`w-full ${isLoading ? "opacity-50" : ""} `}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {cols.map((key, i) => {
            return (
              <TableHead key={key}>
                <div
                  role="button"
                  className={`group flex cursor-pointer select-none items-center gap-3 font-bold text-primary `}
                  onClick={() => onSort(key)}
                >
                  {key} {renderSortChevron(key)}
                </div>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow role="button" key={JSON.stringify(row)} onClick={() => onSelect?.(row)}>
            {cols.map((col, i) => {
              const value = row[col];
              return <TableCell key={i}>{formatValue(value)}</TableCell>;
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DBSearch({ search, isLoading }: { search: (query: string) => void; isLoading: boolean }) {
  const [query, setQuery] = useState("");
  const [debouncing, setDebouncing] = useState(false);

  useEffect(() => {
    setDebouncing(true);
    const timer = setTimeout(() => {
      search(query);
      setDebouncing(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="relative">
      <Input
        className="flex-shrink-1 h-9  min-w-0 border-none bg-primary/30"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
      />
      <div className="absolute right-2 top-2 text-primary">
        {debouncing || isLoading ? <Loader className="h-5 w-5 animate-spin-slow" /> : <Search className="h-5 w-5" />}
      </div>
    </div>
  );
}

export function DBPagination({ paginate }: { paginate: Paginate }) {
  return (
    <div className="flex flex-nowrap gap-1 text-primary">
      <Button
        className="h-9 bg-primary/30 px-2 hover:bg-primary/40 disabled:bg-foreground/40"
        disabled={!paginate.hasPrevPage}
        variant="ghost"
        onClick={() => paginate.prevPage()}
      >
        <ChevronLeft />
      </Button>
      <Button
        className="h-9 bg-primary/30 px-2 hover:bg-primary/40 disabled:bg-foreground/40"
        disabled={!paginate.hasNextPage}
        variant="ghost"
        onClick={() => paginate.nextPage()}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function formatValue(value: Value) {
  if (value instanceof Date) return <span title={value.toLocaleString()}>{value.toDateString()}</span>;
  if (typeof value === "boolean") return value ? <CheckCircle /> : <Circle />;
  if (typeof value === "number") return value;

  let str = Array.isArray(value) ? value.join(", ") : JSON.stringify(value);

  return (
    <div title={str} className="max-w-[20rem] overflow-hidden text-ellipsis whitespace-nowrap">
      {str}
    </div>
  );
}
