import { Paginate } from "@/app/api/queryHelpers";
import { Button } from "../ui/button";
import { FaChevronDown, FaChevronLeft, FaChevronRight, FaChevronUp } from "react-icons/fa";
import { CommonGetParams, GetMeta } from "@/app/api/schemaHelpers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useEffect, useState } from "react";

interface Props {
  data: Record<string, string | number | Date>[];
  meta: GetMeta;
  params: CommonGetParams;
  paginate: Paginate;
  sortBy: (column: string, direction: "asc" | "desc") => void;
  search: (query: string) => void;
  isLoading: boolean;
}

export default function CommonGetTable(props: Props) {
  const [prevProps, setPrevProps] = useState(props);

  useEffect(() => {
    if (props.data) setPrevProps(props);
  }, [props]);

  const { data, meta, paginate } = prevProps;

  if (!data && props.isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  function renderSortChevron(column: string) {
    if (!meta?.sort || column !== meta.sort) return <FaChevronUp className="opacity-0 group-hover:opacity-100" />;
    if (column !== meta.sort) return null;
    if (meta.direction === "asc") return <FaChevronUp />;
    return <FaChevronDown />;
  }

  function onSort(column: string): void {
    if (!meta.sort) return null;
    if (column === meta.sort) {
      props.sortBy(column, meta.direction === "asc" ? "desc" : "asc");
    } else {
      props.sortBy(column, "asc");
    }
  }

  return (
    <div className={props.isLoading ? "opacity-50" : ""}>
      <CommonGetPagination {...paginate} />
      <Table>
        <TableHeader>
          <TableRow>
            {Object.keys(data[0]).map((key) => (
              <TableHead key={key}>
                <div className="group flex cursor-pointer items-center gap-3" onClick={() => onSort(key)}>
                  {key} {renderSortChevron(key)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={JSON.stringify(row)}>
              {Object.values(row).map((value, i) => (
                <TableCell key={i}>{formatValue(value)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CommonGetPagination(paginate: Paginate) {
  return (
    <div>
      <div>
        <Button disabled={!paginate.hasPrevPage} variant="ghost" onClick={() => paginate.prevPage()}>
          <FaChevronLeft />
        </Button>
        <Button disabled={!paginate.hasNextPage} variant="ghost" onClick={() => paginate.nextPage()}>
          <FaChevronRight />
        </Button>
      </div>
    </div>
  );
}

function formatValue(value: string | number | Date) {
  if (value instanceof Date) return value.toLocaleString();
  return value;
}
