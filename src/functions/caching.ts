import { LRUCache } from "lru-cache";
import { z } from "zod";

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
      ttl: options.ttl || 1000 * 60 * 15,
      updateAgeOnGet: options.updateAgeOnGet ?? true,
    });
  }

  toArray(data: z.infer<typeof this.schema>) {
    return this.keys.map((key) => data[key]);
  }

  fromArray(data: any) {
    const obj: any = {};
    this.keys.map((key, i) => (obj[key] = data[i]));
    return this.schema.parse(obj);
  }

  set(key: string, data: z.infer<typeof this.schema>) {
    const str = JSON.stringify(this.toArray(data));
    this.cache.set(key, str);
  }

  get(key: string) {
    const str = this.cache.get(key);
    if (str) console.log("cache hits");
    return str ? this.fromArray(JSON.parse(str)) : null;
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
    max: 1000,
    ttl: 1000 * 60 * 5,
    updateAgeOnGet: false,
  },
);

export const
