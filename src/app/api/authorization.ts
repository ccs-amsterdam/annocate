import { UserDetails, UserRole } from "@/app/types";
import db, { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
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

export async function userDetails(email: string): Promise<UserDetails> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) return { role: user.role };

  if (email === process.env.SUPERADMIN) {
    // if superadmin not in user table, add now
    await db.insert(users).values({
      email,
      role: "admin",
    });
    return { role: "admin" };
  }

  return { role: null };
}

export function hasMinRole(role: UserRole | null, minRole: UserRole) {
  if (!role) return false;
  const sortedRoles = ["guest", "creator", "admin"];

  const roleIndex = sortedRoles.indexOf(role);
  const minRoleIndex = sortedRoles.indexOf(minRole);
  return roleIndex >= minRoleIndex;
}