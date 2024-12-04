import crypto from "crypto";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { z } from "zod";

export class typesafeEncrypt<T> {
  schema: z.ZodType<T>;
  algorithm: string;

  constructor(schema: z.ZodType<T>) {
    this.schema = schema;
    this.algorithm = "aes-256-cbc";
  }

  encrypt(data: T, maxAge?: number) {
    const key = process.env.SECRET_KEY;
    if (!key) throw new Error("No secret key found");
    const keyBuffer = Buffer.from(key, "hex");

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
    const expires = maxAge ? Date.now() + maxAge * 1000 : 0;
    let encrypted = cipher.update(JSON.stringify([data, expires || 0]), "utf8", "hex");
    encrypted += cipher.final("hex");

    const hexIv = iv.toString("hex");
    return hexIv + "." + encrypted;
  }

  decrypt(encryptedData: string) {
    const [iv, encrypted] = encryptedData.split(/\.(.*)/s);

    const key = process.env.SECRET_KEY;
    if (!key) throw new Error("No secret key found");
    const keyBuffer = Buffer.from(key, "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, Buffer.from(iv, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    const [decryptedData, expires] = JSON.parse(decrypted);
    if (expires && expires < Date.now()) throw new Error("Token expired");
    return this.schema.parse(decryptedData);
  }

  encrytedToCookie(cookieStore: ReadonlyRequestCookies, name: string, data: T, maxAge?: number) {
    const encrypted = this.encrypt(data, maxAge);
    cookieStore.set(name, encrypted, { httpOnly: true, secure: true, sameSite: "strict", maxAge });
  }

  cookieToDecrypted(cookieStore: ReadonlyRequestCookies, name: string, newMaxAge?: number) {
    const cookie = cookieStore.get(name);
    if (!cookie) throw new Error("No cookie found");
    const data = this.decrypt(cookie.value);
    if (newMaxAge) this.encrytedToCookie(cookieStore, name, data, newMaxAge);
    return data;
  }
}
