import { Paginate } from "@/app/api/queryHelpers";
import { GetMetaSchema } from "@/app/api/schemaHelpers";
import { useEffect, useState } from "react";
import { DBPagination, DBSearch } from "./DBTable";
import { z } from "zod";
import { Loading } from "../ui/loader";
import { Button } from "../ui/button";
import Link from "next/link";

type Value = string | number | Date | boolean;

interface Props<T> {
  data?: T[];
  meta?: z.infer<typeof GetMetaSchema>;
  paginate: Paginate;
  sortBy: (column: string, direction: "asc" | "desc") => void;
  search: (query: string) => void;
  isLoading: boolean;
  nameField: string;
  jobId: number;
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

  return (
    <div className={props.className || ""}>
      <div className={` mb-4 flex select-none gap-3  ${showPagination ? "" : "hidden"}`}>
        <DBSearch search={props.search} isLoading={props.isLoading} />
        <DBPagination paginate={props.paginate} />
      </div>
      {/* <div className={`mb-3 ${props.isLoading ? "" : "hidden"}`}>Searching...</div> */}
      <div className="flex flex-col gap-1">
        {props.data?.map((row, index) => {
          return (
            <Button
              className="h-8 max-w-full justify-start overflow-hidden text-ellipsis whitespace-nowrap"
              key={index}
              onClick={() => prevProps.onSelect && prevProps.onSelect(row)}
              asChild
            >
              <Link title={String(row[props.nameField])} href={`/manage/${props.jobId}/codebook/${row.id}`}>
                {String(row[props.nameField])}
              </Link>
            </Button>
          );
        })}
      </div>
      <div className="mt-3 w-full">{props.children}</div>
    </div>
  );
}