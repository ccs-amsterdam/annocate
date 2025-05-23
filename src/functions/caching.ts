import db from "@/drizzle/drizzle";
import { eq, and } from "drizzle-orm";
import { managers, projects, users } from "@/drizzle/schema";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import { Authorization } from "@/app/types";

export async function cachedUserRole(email: string, projectId: number | null) {
  "use cache";

  const auth: Authorization = { projectId, email, role: null, projectRole: null };

  if (projectId != null) {
    const [projectUser] = await db
      .select({ projectId: projects.id, role: users.role, projectRole: managers.role })
      .from(projects)
      .leftJoin(managers, eq(projects.id, managers.projectId))
      .leftJoin(users, eq(managers.userId, users.id))
      .where(and(eq(users.email, email), eq(projects.id, projectId)))
      .limit(1);

    if (!projectUser) throw new Error("Project doesn't exist");
    auth.role = projectUser?.role || null;
    auth.projectRole = projectUser?.projectRole || null;
  } else {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.email, email)));

    auth.role = user?.role || null;
  }

  if (email === process.env.SUPERADMIN) {
    if (auth.role !== "admin") {
      auth.role = "admin";
      await db
        .insert(users)
        .values({ email, role: "admin" })
        .onConflictDoUpdate({ target: users.email, set: { role: "admin" } });
    }
  }

  return auth;
}

interface Options {
  max?: number;
  ttl?: number;
  updateAgeOnGet?: boolean;
}

// For efficient and typesafe in-memory caching
export class typesafeLRUCache<T extends z.ZodRawShape> {
  schema: z.ZodObject<T>;
  keys: string[];
  cache: LRUCache<string, string>;

  constructor(schema: z.ZodObject<T>, options: Options) {
    this.schema = schema;
    this.keys = Object.keys(schema.shape);
    this.cache = new LRUCache({
      max: options.max || 1000,
      ttl: options.ttl || undefined,
      updateAgeOnGet: options.updateAgeOnGet ?? true,
    });
  }

  serialize(data: z.infer<typeof this.schema>) {
    const values = this.keys.map((key) => data[key]);
    return JSON.stringify(values.length === 1 ? values[0] : values);
  }

  deserialize(str: string) {
    const values = JSON.parse(str);
    const data = Array.isArray(values) ? values : [values];
    const obj: any = {};
    this.keys.map((key, i) => (obj[key] = data[i]));
    return this.schema.parse(obj);
  }

  set(key: string, data: z.infer<typeof this.schema>) {
    const str = this.serialize(data);
    this.cache.set(key, str);
  }

  get(key: string): z.infer<typeof this.schema> | null {
    const str = this.cache.get(key);
    return str ? this.deserialize(str) : null;
  }
}

// Cache for checking user project role
export const projectRoleCache = new typesafeLRUCache(
  z.object({
    email: z.string(),
    role: z.enum(["admin", "guest", "creator"]).nullable(),
    projectRole: z.enum(["admin", "manager"]).nullable(),
    projectId: z.coerce.number().nullish(),
  }),
  {
    max: 2500,
    ttl: 1000 * 60 * 5,
    updateAgeOnGet: false,
  },
);

export const codebookInProjectCache = new typesafeLRUCache(
  z.object({
    true: z.boolean(),
  }),
  { max: 2000 },
);

export const jobInProject = new typesafeLRUCache(
  z.object({
    true: z.boolean(),
  }),
  { max: 2000 },
);

export const codebookNodeInJob = new typesafeLRUCache(
  z.object({
    true: z.boolean(),
  }),
  { max: 5000 },
);

export const setInJob = new typesafeLRUCache(
  z.object({
    true: z.boolean(),
  }),
  { max: 5000 },
);
