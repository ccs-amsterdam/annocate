import { Paginate } from "@/app/api/queryHelpers";
import { GetMetaSchema } from "@/app/api/schemaHelpers";
import { useEffect, useState } from "react";
import { DBPagination, DBSearch } from "./DBTable";
import { z } from "zod";
import { Loading } from "../ui/loader";
import { Button } from "../ui/button";
import Link from "next/link";
import { ChevronRight, CircleDot, Dot, DotIcon } from "lucide-react";

type Value = string | number | Date | boolean;

interface Props<T> {
  data?: T[];
  meta?: z.infer<typeof GetMetaSchema>;
  paginate: Paginate;
  sortBy: (column: string, direction: "asc" | "desc") => void;
  search: (query: string) => void;
  isLoading: boolean;
  nameField: string;
  projectId: number;
  children?: React.ReactNode;
  className?: string;
  onSelect?: (row: T) => void;
}

export default function DBSelect<T extends Record<string, Value>>(props: Props<T>) {
  const [prevProps, setPrevProps] = useState(props);

  useEffect(() => {
    if (props.data) setPrevProps(props);
  }, [props]);

  const showPagination = props.meta && props.meta.rows > props.meta.pageSize;

  if (prevProps.isLoading) {
    return <Loading />;
  }

  return (
    <div className={props.className || ""}>
      <div className={` mb-4 flex select-none gap-3  ${showPagination ? "" : "hidden"}`}>
        <DBSearch search={props.search} isLoading={props.isLoading} />
        <DBPagination paginate={props.paginate} />
      </div>
      {/* <div className={`mb-3 ${props.isLoading ? "" : "hidden"}`}>Searching...</div> */}
      <div className="flex flex-col ">
        {prevProps.data?.map((row, index) => {
          return (
            <Button
              key={index}
              variant="ghost"
              className="flex h-8 max-w-full items-center justify-start gap-2 overflow-hidden text-ellipsis whitespace-nowrap pl-0 hover:bg-foreground/20"
              onClick={() => props.onSelect && props.onSelect(row)}
            >
              <ChevronRight size={16} />
              {String(row[props.nameField])}
            </Button>
          );
        })}
      </div>
      <div className="mt-3 w-full">{props.children}</div>
    </div>
  );
}
