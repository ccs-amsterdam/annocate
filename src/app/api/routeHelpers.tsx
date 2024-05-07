import { and, asc, count, desc, like, or, SQL } from "drizzle-orm";
import { PgColumn, PgSelect, PgTableWithColumns } from "drizzle-orm/pg-core";
import { GetParams } from "./schemaHelpers";
import { authenticateUser } from "@/functions/authorization";
import { NextRequest, NextResponse } from "next/server";
import db from "@/drizzle/schema";
import { z } from "zod";

export function withGetParams<T extends PgSelect>(
  qb: T,
  table: PgTableWithColumns<any>,
  params: GetParams,
  queryColumns?: string[],
  defaultSort?: string,
  withPagination = true,
) {
  const where: SQL[] = [];

  if (params.query) {
    const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
    where.push(or(...orFilters));
  }

  let sortBy = defaultSort ? table[defaultSort] : table.id;
  if (params.sort) {
    const isDesc = /^-/.test(params.sort);
    if (isDesc) {
      sortBy = desc(table[params.sort.slice(1)]);
    } else {
      sortBy = asc(table[params.sort]);
    }
  }

  if (!withPagination) return qb.where(and(...where));

  return qb
    .offset(params.offset)
    .limit(params.limit)
    .orderBy(sortBy)
    .where(and(...where));
}

interface CommonGetParams {
  req: NextRequest;
  table: PgTableWithColumns<any>;
  rowsQuery: PgSelect;
  metaQuery: PgSelect;
  ParamSchema: z.ZodTypeAny;
  queryColumns?: string[];
  defaultSort?: string;
}

export async function CommonGet({
  req,
  table,
  rowsQuery,
  metaQuery,
  ParamSchema,
  queryColumns,
  defaultSort,
}: CommonGetParams) {
  try {
    const params = validateRequestParams(req, ParamSchema);
    if (params.meta) {
      const [res] = await withGetParams(metaQuery, table, params, queryColumns, defaultSort, false);
      return NextResponse.json(res);
    } else {
      const res = await withGetParams(rowsQuery, table, params, queryColumns, defaultSort, true);
      return NextResponse.json(res);
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export default function validateRequestParams<T extends z.ZodTypeAny>(req: NextRequest, schema: T) {
  const params: Record<string, any> = {};
  for (let [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = req.nextUrl.searchParams.get(key);
  }
  return schema.parse(params);
}
