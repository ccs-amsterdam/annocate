import db from "@/drizzle/schema";
import { and, asc, count, desc, gt, gte, like, lt, lte, or, SQL } from "drizzle-orm";
import { PgTableWithColumns, SubqueryWithSelection } from "drizzle-orm/pg-core";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "../types";
import { authenticateUser, userDetails } from "./authorization";
import { CommonGetParams } from "./schemaHelpers";

interface After {
  column: string;
  value: number | string | Date | boolean;
  isDate?: boolean;
  isBoolean?: boolean;
}

interface CreateCommonGetParams<T> {
  tableFunction: (email: string, params: T) => PgTableWithColumns<any> | SubqueryWithSelection<any, any>;
  req: NextRequest;
  paramsSchema: z.ZodType<T>;
  idColumn: string;
  queryColumns?: string[];
  authorizeFunction?: (role: UserRole | null, params: T) => boolean;
}

/**
 * Creates a common GET request for fetching data from a table.
 * Includes efficient pagination using a next token. The next token also encodes the response from the
 * meta query to avoid re-fetching the meta data.
 *
 * @returns A Promise that resolves to the response JSON object containing the fetched data, meta data, and next token.
 */
export async function createCommonGet<T>({
  tableFunction,
  req,
  paramsSchema,
  idColumn,
  queryColumns,
  authorizeFunction,
}: CreateCommonGetParams<T>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const params = validateRequestParams(req, paramsSchema);
    if (authorizeFunction != undefined) {
      const user = await userDetails(email);
      if (!authorizeFunction(user.role, params)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const table = tableFunction(email, params);

    if (params.nextToken) {
      const { commonParams, after, meta } = parseNextToken(params.nextToken);

      const data = await withCommonGet(table, commonParams, idColumn, queryColumns, after);
      meta.page = meta.page + 1;

      const nextToken = createNextToken(commonParams, data, meta, idColumn);
      return NextResponse.json({ data, meta, nextToken });
    } else {
      const commonParams = {
        query: params.query,
        sort: params.sort || idColumn,
        direction: params.direction,
        pageSize: params.pageSize,
      };

      const [metaResponse] = await withCommonMetaGet(table, commonParams, queryColumns);
      const meta = {
        ...metaResponse,
        page: 0,
        pageSize: params.pageSize,
        sort: params.sort || idColumn,
        direction: params.direction,
      };
      if (metaResponse.rows === 0) return NextResponse.json({ data: [], meta, nextToken: "" });

      const data = await withCommonGet(table, commonParams, idColumn, queryColumns);
      const nextToken = createNextToken(commonParams, data, meta, idColumn);
      return NextResponse.json({ data, meta, nextToken });
    }
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(e.message, { status: 400 });
  }
}

interface CreateCommonUpdateParams<T> {
  updateFunction: (email: string, body: T) => Promise<any>;
  req: Request;
  bodySchema: z.ZodType<T>;
  authorizeFunction: (role: UserRole | null, body: T) => boolean;
  responseSchema?: z.ZodTypeAny;
}

export async function createCommonUpdate<T>({
  updateFunction,
  req,
  bodySchema,
  authorizeFunction,
  responseSchema,
}: CreateCommonUpdateParams<T>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const bodyRaw = await req.json();
    const body = bodySchema.parse(bodyRaw);
    if (authorizeFunction != undefined) {
      const user = await userDetails(email);
      if (!authorizeFunction(user.role, body)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await updateFunction(email, body);

    if (responseSchema) return NextResponse.json(responseSchema.parse(row));
    return NextResponse.json(row);
  } catch (e: any) {
    console.error(e);
    if (e.message.includes("duplicate key value")) {
      return NextResponse.json({ message: `This entry already exists` }, { status: 400 });
    }
    return NextResponse.json(e.message, { status: 400 });
  }
}

function validateRequestParams<T extends z.ZodTypeAny>(req: NextRequest, schema: T) {
  const params: Record<string, any> = {};
  for (let [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = req.nextUrl.searchParams.get(key);
  }
  return schema.parse(params);
}

function withCommonGet(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: CommonGetParams,
  idColumn: string,
  queryColumns?: string[],
  after?: After[],
) {
  const where: SQL[] = [];
  const orderBy: SQL[] = [];

  if (params.query && queryColumns) {
    const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
    const ors = or(...orFilters);
    if (ors) {
      where.push(ors);
    }
  }

  const direction = params.direction === "desc" ? desc : asc;
  if (params.sort && params.sort !== idColumn) {
    orderBy.push(direction(table[params.sort]));
    orderBy.push(direction(table[idColumn]));
  } else {
    orderBy.push(direction(table[idColumn]));
  }

  if (after) {
    const uniqueOperator = params.direction === "asc" ? gt : lt;
    const operator = params.direction === "asc" ? gte : lte;
    for (let { column, value } of after) {
      if (column === idColumn) where.push(uniqueOperator(table[column], value));
      else where.push(operator(table[column], value));
    }
  }

  return db
    .select()
    .from(table)
    .limit(params.pageSize)
    .orderBy(...orderBy)
    .where(and(...where));
}

function withCommonMetaGet(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: CommonGetParams,
  queryColumns?: string[],
) {
  const where: SQL[] = [];

  if (params.query && queryColumns) {
    const orFilters = queryColumns.map((column) => like(table[column], `%${params.query}%`));
    const ors = or(...orFilters);
    if (ors) where.push(ors);
  }

  return db
    .select({ rows: count() })
    .from(table)
    .where(and(...where));
}

function createNextToken(commonParams: CommonGetParams, data: any, meta: any, idColumn: string) {
  const hasNext = (meta.page + 1) * meta.pageSize < meta.rows;
  if (!hasNext) return "";

  const newAfter: After[] = [{ column: idColumn, value: data[data.length - 1][idColumn] }];
  if (commonParams.sort) newAfter.push({ column: commonParams.sort, value: data[data.length - 1][commonParams.sort] });

  // need to remember some value types for parsing
  for (let i = 0; i < newAfter.length; i++) {
    if (newAfter[i].value instanceof Date) newAfter[i].isDate = true;
    if (typeof newAfter[i].value === "boolean") newAfter[i].isBoolean = true;
  }

  const nextParams = { commonParams, meta, after: newAfter };
  return jwt.sign(nextParams, process.env.SECRET_KEY as string);
}
function parseNextToken(token: string) {
  const { commonParams, after, meta } = jwt.verify(token, process.env.SECRET_KEY as string) as {
    commonParams: CommonGetParams;
    meta: any;
    after: After[];
  };

  // parse date strings back into Date objects
  for (let i = 0; i < after.length; i++) {
    if (after[i].isDate) after[i].value = new Date(String(after[i].value));
    if (after[i].isBoolean) after[i].value = after[i].value === "true";
  }

  return { commonParams, after, meta };
}
