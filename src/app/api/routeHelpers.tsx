import db from "@/drizzle/schema";
import { and, asc, count, desc, eq, gt, gte, like, lt, lte, or, sql, SQL } from "drizzle-orm";
import { PgTableWithColumns, SubqueryWithSelection } from "drizzle-orm/pg-core";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Authorization, UserRole } from "../types";
import { authenticateUser, authorization } from "./authorization";
import { createTableParamsSchema } from "./schemaHelpers";
import { fromZodError } from "zod-validation-error";

interface After {
  column: string;
  value: number | string | Date | boolean;
  isDate?: boolean;
  isBoolean?: boolean;
}

interface ErrorMessages {
  [key: number]: string;
}

interface AuthorizationError {
  message?: string;
  status?: number;
}

const TableParamsSchema = createTableParamsSchema({});
export type TableParams = z.infer<typeof TableParamsSchema>;

type AuthorizeFunction<T> = (auth: Authorization, params: T) => Promise<AuthorizationError | undefined>;
type ErrorFunction<T> = (status: number, params?: T) => string | undefined;

interface CreateGetParams<BodyOut, BodyIn> {
  selectFunction: (email: string, params: BodyOut) => Promise<any>;
  req: NextRequest;
  paramsSchema?: z.ZodType<BodyOut, z.ZodTypeDef, BodyIn>;
  responseSchema?: z.ZodTypeAny;
  projectId: number | null;
  authorizeFunction?: AuthorizeFunction<BodyIn>;
}

export async function createGet<BodyOut, BodyIn>({
  selectFunction,
  req,
  paramsSchema,
  responseSchema,
  authorizeFunction,
  projectId,
}: CreateGetParams<BodyOut, BodyIn>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const params = paramsSchema ? validateRequestParams(req, paramsSchema) : undefined;
    if (authorizeFunction != undefined) {
      const auth = await authorization(email, projectId);
      const authError = await authorizeFunction(auth, params);
      if (authError)
        return NextResponse.json({ message: authError.message || "Unauthorized" }, { status: authError.status || 403 });
    }

    const response = await selectFunction(email, params);
    if (responseSchema) return NextResponse.json(responseSchema.parse(response));
    return NextResponse.json(response);
  } catch (e: any) {
    console.error(e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ message: String(fromZodError(e)) }, { status: 400 });
    }
    return NextResponse.json(e.message, { status: 400 });
  }
}

interface CreateDeleteParams<BodyIn> {
  deleteFunction: (email: string, body: BodyIn) => Promise<any>;
  req: NextRequest;
  paramsSchema?: z.ZodType<BodyIn>;
  authorizeFunction?: AuthorizeFunction<BodyIn>;
  projectId: number | null;
}

export async function createDelete<BodyIn>({
  deleteFunction,
  req,
  paramsSchema,
  authorizeFunction,
  projectId,
}: CreateDeleteParams<BodyIn>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const params = paramsSchema ? validateRequestParams(req, paramsSchema) : undefined;
    if (authorizeFunction != undefined) {
      const auth = await authorization(email, projectId);
      const authError = await authorizeFunction(auth, params);
      if (authError)
        return NextResponse.json({ message: authError.message || "Unauthorized" }, { status: authError.status || 403 });
    }

    const response = await deleteFunction(email, params);
    return NextResponse.json(response);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(e.message, { status: 400 });
  }
}

interface CreateTableGetParams<T> {
  tableFunction: (email: string, params: T) => PgTableWithColumns<any> | SubqueryWithSelection<any, any>;
  req: NextRequest;
  paramsSchema: z.ZodType<T>;
  responseSchema?: z.ZodTypeAny;
  idColumn: string;
  projectId: number | null;
  queryColumns?: string[];
  maxRows?: number;
  authorizeFunction?: AuthorizeFunction<T>;
  errorFunction?: ErrorFunction<T>;
}

/**
 * Creates a common GET request for fetching data from a table.
 * Includes efficient pagination using a next token. The next token also encodes the response from the
 * meta query to avoid re-fetching the meta data.
 *
 * @returns A Promise that resolves to the response JSON object containing the fetched data, meta data, and next token.
 */
export async function createTableGet<T>({
  tableFunction,
  req,
  paramsSchema,
  responseSchema,
  idColumn,
  projectId,
  queryColumns,
  maxRows,
  authorizeFunction,
  errorFunction,
}: CreateTableGetParams<T>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: errorFunction?.(401) || "Unauthorized" }, { status: 401 });

  let paramCopy: T | undefined = undefined;
  try {
    const params = validateRequestParams(req, paramsSchema);
    paramCopy = params;

    if (authorizeFunction != undefined) {
      const auth = await authorization(email, projectId);
      const authError = await authorizeFunction(auth, params);
      if (authError)
        return NextResponse.json(
          { message: authError.message || errorFunction?.(authError.status || 403, params) || "Unauthorized" },
          { status: authError.status || 403 },
        );
    }

    const table = tableFunction(email, params);

    if (params.nextToken) {
      const { commonParams, after, meta } = parseNextToken(params.nextToken);

      const data = await queryWithTableFilters(table, commonParams, idColumn, queryColumns, after);
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

      const [metaResponse] = await queryMeta(table, commonParams, queryColumns);
      const meta = {
        ...metaResponse,
        page: 0,
        pageSize: params.pageSize,
        sort: params.sort || idColumn,
        direction: params.direction,
      };
      if (metaResponse.rows === 0) return NextResponse.json({ data: [], meta, nextToken: "" });

      const data = await queryWithTableFilters(table, commonParams, idColumn, queryColumns);
      const nextToken = createNextToken(commonParams, data, meta, idColumn);

      if (responseSchema) return NextResponse.json({ data: z.array(responseSchema).parse(data), meta, nextToken });
      return NextResponse.json({ data, meta, nextToken });
    }
  } catch (e: any) {
    console.error(e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ message: String(fromZodError(e)) }, { status: 400 });
    }
    return NextResponse.json(errorFunction?.(400, paramCopy) || e.message, { status: 400 });
  }
}

interface CreateCommonUpdateParams<BodyIn, BodyOut> {
  updateFunction: (email: string, body: BodyOut) => Promise<any>;
  req: Request;
  bodySchema: z.ZodType<BodyOut, z.ZodTypeDef, BodyIn>;
  authorizeFunction: AuthorizeFunction<BodyOut>;
  projectId: number | null;
  responseSchema?: z.ZodTypeAny;
  errorFunction?: ErrorFunction<BodyOut>;
}

export async function createUpdate<BodyIn, BodyOut>({
  updateFunction,
  req,
  bodySchema,
  authorizeFunction,
  projectId,
  responseSchema,
  errorFunction,
}: CreateCommonUpdateParams<BodyIn, BodyOut>) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ message: errorFunction?.(401) || "Unauthorized" }, { status: 401 });

  let bodyCopy: BodyOut | undefined = undefined;
  try {
    const bodyRaw = await req.json();
    const body = bodySchema.parse(bodyRaw);
    bodyCopy = body;

    if (authorizeFunction != undefined) {
      const auth = await authorization(email, projectId);
      const authError = await authorizeFunction(auth, body);
      if (authError)
        return NextResponse.json(
          { message: authError.message || errorFunction?.(authError.status || 403) || "Unauthorized" },
          { status: authError.status || 403 },
        );
    }

    const response = await updateFunction(email, body);

    if (responseSchema) return NextResponse.json(responseSchema.parse(response));
    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    if (e.message.includes("duplicate key value")) {
      return NextResponse.json(
        { message: errorFunction?.(409, bodyCopy) || `This entry already exists` },
        { status: 409 },
      );
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ message: String(fromZodError(e)) }, { status: 400 });
    }
    return NextResponse.json({ message: errorFunction?.(400, bodyCopy) || e.message }, { status: 400 });
  }
}

function validateRequestParams<T extends z.ZodTypeAny>(req: NextRequest, schema: T) {
  const params: Record<string, any> = {};
  for (let [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = req.nextUrl.searchParams.get(key);
  }
  return schema.parse(params);
}

function queryWithTableFilters(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: TableParams,
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
    if (params.sort.includes("->>")) {
      // this means its a json column. Need to hack it a bit to get it to work in a way that's still injection safe
      const [key, subkey] = params.sort.split("->>");
      orderBy.push(direction(sql`${table[key]}->>${subkey}`));
    } else {
      orderBy.push(direction(table[params.sort]));
    }
    orderBy.push(direction(table[idColumn]));
  } else {
    orderBy.push(direction(table[idColumn]));
  }

  if (after) {
    // need to filter on values beyond the after value.
    // and also filter on the ID column for values that equal the after value
    const operator = params.direction === "asc" ? gt : lt;

    const uniqueFilterColumn = after.find((a) => a.column === idColumn);
    if (!uniqueFilterColumn) throw new Error("Unique filter column not found");
    const higherIdFilter = operator(table[idColumn], uniqueFilterColumn.value);

    let onlyById = true;
    for (let { column, value } of after) {
      if (column === idColumn) continue;

      let sqlCol = table[column];
      if (column.includes("->>")) {
        const [key, subkey] = column.split("->>");
        sqlCol = sql`${table[key]}->>${subkey}`;
      }
      const beyondAfter = operator(sqlCol, value);
      const higherId = and(eq(sqlCol, value), higherIdFilter);
      const either = or(beyondAfter, higherId);
      if (either) where.push(either);
      onlyById = false;
    }
    if (onlyById) where.push(higherIdFilter);
  }

  const query = db
    .select()
    .from(table)
    .orderBy(...orderBy)
    .where(and(...where))
    .limit(params.pageSize);

  // console.log(query.toSQL());

  return query;
}

function queryMeta(
  table: PgTableWithColumns<any> | SubqueryWithSelection<any, any>,
  params: TableParams,
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

function createNextToken(commonParams: TableParams, data: any, meta: any, idColumn: string) {
  const hasNext = (meta.page + 1) * meta.pageSize < meta.rows;
  if (!hasNext) return "";

  const newAfter: After[] = [{ column: idColumn, value: data[data.length - 1][idColumn] }];
  if (commonParams.sort) {
    if (commonParams.sort.includes("->>")) {
      const [key, subkey] = commonParams.sort.split("->>");
      newAfter.push({ column: commonParams.sort, value: data[data.length - 1][key][subkey] });
    } else {
      newAfter.push({ column: commonParams.sort, value: data[data.length - 1][commonParams.sort] });
    }
  }

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
    commonParams: TableParams;
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
