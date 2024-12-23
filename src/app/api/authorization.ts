import { Authorization, ProjectRole, UserRole } from "@/app/types";
import { managers, users } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { typesafeEncrypt } from "@/functions/typesafeEncrypt";
import { z } from "zod";

const authTokenEncryptor = new typesafeEncrypt(
  z.object({
    email: z.string(),
    role: z.enum(["admin", "guest", "creator"]).nullable(),
    projectRole: z.enum(["admin", "manager"]).nullable(),
    projectId: z.coerce.number().nullish(),
  }),
);

class TokenVerifier {
  publicKey: string | null = null;

  constructor() {}

  async verifyToken(token: string) {
    let publicKey = await this.getPublicKey();
    if (!publicKey) return null;

    let payload = jwt.verify(token, publicKey);

    if (!payload) {
      // try again once, because key could have rotated
      publicKey = await this.getNewPublicKey();
      if (!publicKey) return null;
      payload = jwt.verify(token, publicKey);
    }

    if (!payload || typeof payload !== "object") return null;

    if (payload.resource !== process.env.ANNOCATE_URL + "/api") {
      // token not signed for this resource
      return null;
    }

    const exp = payload?.exp || 0;
    const now = Date.now() / 1000;
    if (exp < now) {
      // token expired
      return null;
    }

    return payload.email || null;
  }

  async getPublicKey() {
    if (this.publicKey !== null) return this.publicKey;
    const trusted_middlecat = process.env.MIDDLECAT_URL;
    if (!trusted_middlecat) throw new Error("MIDDLECAT_URL not set");
    const res = await fetch(trusted_middlecat + "/api/configuration");
    const config = await res.json();

    this.publicKey = config.public_key;
    return this.publicKey;
  }

  async getNewPublicKey() {
    this.publicKey = null;
    return this.getPublicKey();
  }
}

const tokenVerifier = new TokenVerifier();

export async function authenticateUser(req: Request): Promise<string> {
  if (process.env.MIDDLECAT_URL === "DEVMODE" || process.env.TEST_MODE === "true") {
    return process.env.SUPERADMIN || "";
  }
  const bearer: string | null = req.headers.get("authorization");
  const access_token = bearer?.split(" ")[1] || "";
  if (!access_token) return "";

  return await tokenVerifier.verifyToken(access_token);
}

export async function authorization(email: string, projectId: number | null): Promise<Authorization> {
  const cookieStore = await cookies();
  const auth: Authorization = { projectId, email, role: null, projectRole: null };

  const authTokenCookieName = projectId != null ? `projects:session` : "session";

  // first check if valid auth token for current user exists in cookie. If so, return values and update cookie
  try {
    const session = authTokenEncryptor.cookieToDecrypted(cookieStore, authTokenCookieName, 60 * 15);
    if (projectId !== null) {
      if (session.email === email && session.projectId === projectId) return session;
    } else {
      if (session.email === email) return session;
    }
  } catch (e) {
    console.log("Need to authenticate");
    // token expired or invalid. Need to fetch new token
  }

  if (projectId != null) {
    const [user] = await db
      .select({ role: users.role, projectRole: managers.role })
      .from(users)
      .leftJoin(managers, eq(users.id, managers.userId))
      .where(and(eq(users.email, email), eq(managers.projectId, projectId)));

    auth.role = user?.role || null;
    auth.projectRole = user?.projectRole || null;
    auth.projectId = projectId;
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

  authTokenEncryptor.encryptedToCookie(cookieStore, authTokenCookieName, auth, 60 * 15);

  return auth;
}

export function hasMinRole(role: UserRole | null, minRole: UserRole) {
  if (!role) return false;
  const sortedRoles = ["guest", "creator", "admin"];

  const roleIndex = sortedRoles.indexOf(role);
  const minRoleIndex = sortedRoles.indexOf(minRole);
  return roleIndex >= minRoleIndex;
}

export function hasMinProjectRole(role: ProjectRole | null, minRole: ProjectRole) {
  if (!role) return false;
  const sortedRoles = ["manager", "admin"];

  const roleIndex = sortedRoles.indexOf(role);
  const minRoleIndex = sortedRoles.indexOf(minRole);
  return roleIndex >= minRoleIndex;
}
