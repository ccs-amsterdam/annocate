import { and, asc, count, desc, gt, like, or, SQL, Subquery } from "drizzle-orm";
import { PgColumn, PgSelect, PgTable, PgTableFn, PgTableWithColumns, SubqueryWithSelection } from "drizzle-orm/pg-core";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CommonGetParams } from "./schemaHelpers";
import db from "@/drizzle/schema";

interface After {
  column: string;
  value: any;
}

export function withCommonGet(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: CommonGetParams,
  queryColumns?: string[],
  after?: After[],
) {
  const where: SQL[] = [];

  if (params.query) {
    const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
    where.push(or(...orFilters));
  }

  if (after) {
    for (const { column, value } of after) {
      where.push(gt(table[column], value));
    }
  }
  const sortColumn = table[params.sort];
  const sortBy = params.direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  console.log(after);

  return db
    .select()
    .from(table)
    .limit(params.pageSize)
    .orderBy(sortBy)
    .where(and(...where));
}

export function withCommonMetaGet(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: CommonGetParams,
  queryColumns?: string[],
) {
  const where: SQL[] = [];

  if (params.query) {
    const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
    where.push(or(...orFilters));
  }

  return db
    .select({ rows: count() })
    .from(table)
    .where(and(...where));
}

interface CreateCommonGetParams {
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>;
  subQuery?: SubqueryWithSelection<any, any>;
  params: CommonGetParams;
  idColumn: string;
  queryColumns?: string[];
}

/**
 * Creates a common GET request for fetching data from a table.
 * Includes efficient pagination using a next token. The next token also encodes the response from the
 * meta query to avoid re-fetching the meta data.
 *
 * @param table - The table to fetch data from.
 * @param rowsQuery - The query for fetching rows data.
 * @param metaQuery - The query for fetching meta data.
 * @param params - The parameters for the GET request.
 * @param idColumn - The column used as the unique identifier for rows.
 * @param queryColumns - The columns to include in the query.
 * @returns A Promise that resolves to the response JSON object containing the fetched data, meta data, and next token.
 */
export async function createCommonGet({ table, params, idColumn, queryColumns }: CreateCommonGetParams) {
  const metaSelect = { rows: count() };

  if (params.nextToken) {
    const { commonParams, after, meta } = parseNextToken(params.nextToken);

    const data = await withCommonGet(table, commonParams, queryColumns, after);
    meta.page = meta.page + 1;

    const hasNext = (meta.page + 1) * meta.pageSize < meta.rows;
    const nextToken = hasNext ? createNextToken(commonParams, data, meta, idColumn) : "";
    return NextResponse.json({ data, meta, nextToken });
  } else {
    const commonParams = {
      query: params.query,
      sort: params.sort || idColumn,
      direction: params.direction,
      pageSize: params.pageSize,
    };

    const data = await withCommonGet(table, commonParams, queryColumns);
    const [metaResponse] = await withCommonMetaGet(table, commonParams, queryColumns);
    const meta = {
      ...metaResponse,
      page: 0,
      pageSize: params.pageSize,
      sort: params.sort || idColumn,
      direction: params.direction,
    };

    const nextToken = createNextToken(commonParams, data, meta, idColumn);
    return NextResponse.json({ data, meta, nextToken });
  }
}

function createNextToken(commonParams: CommonGetParams, data: any, meta: any, idColumn: string) {
  const newAfter: After[] = [{ column: idColumn, value: data[data.length - 1][idColumn] }];
  if (commonParams.sort) newAfter.push({ column: commonParams.sort, value: data[data.length - 1][commonParams.sort] });
  const nextParams = { commonParams, meta, after: newAfter };
  return jwt.sign(nextParams, process.env.SECRET_KEY);
}
function parseNextToken(token: string) {
  return jwt.verify(token, process.env.SECRET_KEY) as { commonParams: CommonGetParams; meta: any; after: After[] };
}

export function validateRequestParams<T extends z.ZodTypeAny>(req: NextRequest, schema: T) {
  const params: Record<string, any> = {};
  for (let [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = req.nextUrl.searchParams.get(key);
  }
  return schema.parse(params);
}

export async function queryResponse(query: PgSelect) {
  try {
    const res = await query;
    return NextResponse.json(res);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
