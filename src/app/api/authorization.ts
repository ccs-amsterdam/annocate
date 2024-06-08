import { Authorization, ProjectRole, UserRole } from "@/app/types";
import db, { managers, users } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

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

export async function authenticateUser(req: Request): Promise<string | null> {
  const bearer: string | null = req.headers.get("authorization");
  const access_token = bearer?.split(" ")[1] || "";
  if (!access_token) return null;

  return await tokenVerifier.verifyToken(access_token);
}

// Function for getting user details, primarily for server side use to authorize requests.
export async function authorization(email: string, projectId?: number): Promise<Authorization> {
  const auth: Authorization = { email, role: null, projectRole: null };

  if (email === process.env.SUPERADMIN) {
    if (projectId) auth.projectId = projectId;
    auth.superAdmin = true;
    auth.role = "admin";
    auth.projectRole = "admin";

    // add if doesn't exist
    await db.insert(users).values({ email, role: "admin" }).onConflictDoNothing();

    return auth;
  }

  if (projectId) {
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
