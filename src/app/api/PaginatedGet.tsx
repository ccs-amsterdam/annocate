import db from "@/drizzle/schema";
import { authenticateUser } from "@/functions/authorization";
import validateRequestParams from "@/functions/validateRequestParams";
import { and, asc, count, desc, eq, gt, gte, like, lt, lte, max, min, or, SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const PaginatedGetFilter = z.object({
  column: z.string(),
  value: z.string(),
  operator: z.enum(["=", ">", "<", ">=", "<=", "like"]),
});

const PaginatedGetSchema = z.object({
  offset: z.number().default(0),
  limit: z.number().default(10),
  query: z.string().optional(),
  filters: z.array(PaginatedGetFilter),
  sort: z
    .object({
      column: z.string(),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
});

const MetaSchema = z.object({
  rows: z.number(),
});

export interface GETParams {
  table: any;
  req: Request;
  queryColumns: string[];
  filterColumns: string[];
  responseSchema: z.ZodObject<any, any>;
}
export type PaginatedGetParams = z.infer<typeof PaginatedGetSchema>;
export type PaginatedGetFilter = z.infer<typeof PaginatedGetFilter>;

export async function PaginatedGet({ table, queryColumns, filterColumns, responseSchema, req }: GETParams) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const params = validateRequestParams(req, PaginatedGetSchema);
    const wherePagination: SQL[] = [];
    const whereFilters: SQL[] = [];

    for (const filter of params.filters || []) {
      if (!filterColumns.includes(filter.column))
        return NextResponse.json({ error: `Can only filters on: ${filterColumns}` }, { status: 400 });
      const column = table[filter.column];
      if (filter.operator === "=") whereFilters.push(eq(column, filter.value));
      if (filter.operator === ">") whereFilters.push(gt(column, filter.value));
      if (filter.operator === "<") whereFilters.push(lt(column, filter.value));
      if (filter.operator === ">=") whereFilters.push(gte(column, filter.value));
      if (filter.operator === "<=") whereFilters.push(lte(column, filter.value));
    }
    if (params.query) {
      const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
      whereFilters.push(or(...orFilters));
    }
    function sortColumn() {
      if (!params.sort) return table.id;
      if (params.sort.direction === "asc") return asc(table[params.sort.column]);
      return desc(table[params.sort.column]);
    }

    const metaPromise = db
      .select({ rows: count() })
      .from(table)
      .where(and(...whereFilters));
    const rowsPromise = db
      .select()
      .from(table)
      .orderBy(sortColumn())
      .where(and(...wherePagination, ...whereFilters))
      .offset(params.offset)
      .limit(params.limit);
    const [meta, rows] = await Promise.all([metaPromise, rowsPromise]);

    const res = { meta: MetaSchema.parse(meta), rows: z.array(responseSchema).parse(rows) };
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
