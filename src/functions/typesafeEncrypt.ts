import crypto from "crypto";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { z } from "zod";

export class typesafeEncrypt<T extends z.ZodRawShape> {
  schema: z.ZodObject<T>;
  algorithm: string;
  keys: string[];

  constructor(schema: z.ZodObject<T>) {
    this.schema = schema;
    this.algorithm = "aes-256-cbc";
    this.keys = Object.keys(schema.shape);
  }

  toArray(data: z.infer<typeof this.schema>) {
    return this.keys.map((key) => data[key]);
  }

  fromArray(data: any) {
    const obj: any = {};
    this.keys.map((key, i) => (obj[key] = data[i]));
    return this.schema.parse(obj);
  }

  /**
   * Encrypts the given data and returns the encrypted data.
   *
   * @param data - The data to encrypt.
   * @param maxAge - Optional. The maximum age of the encrypted data in seconds.
   * @returns
   */
  encrypt(data: z.infer<typeof this.schema>, maxAge?: number) {
    const key = process.env.SECRET_KEY;
    if (!key) throw new Error("No secret key found");
    const keyBuffer = Buffer.from(key, "base64");

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
    const expires = maxAge ? Date.now() + maxAge * 1000 : 0;

    const saltshaker = crypto.randomBytes(16).toString("base64");
    let encrypted = cipher.update(JSON.stringify([this.toArray(data), expires || 0]), "utf8", "base64");
    encrypted += cipher.final("base64");

    const hexIv = iv.toString("base64");
    return hexIv + encrypted;
  }

  /**
   * Decrypts the given encrypted data and returns the decrypted data.
   *
   * @param encryptedData - The encrypted data to decrypt.
   */
  decrypt(encryptedData: string) {
    const [iv, encrypted] = [encryptedData.slice(0, 24), encryptedData.slice(24)];

    const key = process.env.SECRET_KEY;
    if (!key) throw new Error("No secret key found");
    const keyBuffer = Buffer.from(key, "base64");
    const ivBuffer = Buffer.from(iv, "base64");

    const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, ivBuffer);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    const [decryptedData, expires] = JSON.parse(decrypted);

    if (expires && expires < Date.now()) throw new Error("Token expired");
    return this.fromArray(decryptedData);
  }

  /**
   * Converts the given data to an encrypted string and sets it as a cookie.
   *
   * @param cookieStore - The cookie store to set the cookie in.
   * @param name - The name of the cookie. Can include a path by separating with a colon. E.g. "/projects:name".
   * @param data - The data to encrypt and set as the cookie value.
   * @param maxAge - Optional. The maximum age of the cookie in seconds.
   */
  encryptedToCookie(
    cookieStore: ReadonlyRequestCookies,
    name: string,
    data: z.infer<typeof this.schema>,
    maxAge?: number,
  ) {
    const encrypted = this.encrypt(data, maxAge);
    const path = name.includes(":") ? "/api/" + name.split(":")[0] : "/";
    cookieStore.set(name, encrypted, { httpOnly: true, secure: true, sameSite: "strict", maxAge, path });
  }

  /**
   * Decrypts the cookie value and returns the decrypted data.
   *
   * @param cookieStore - The cookie store to get the cookie from.
   * @param name - The name of the cookie.
   * @param newMaxAge - Optional. If provided, the cookie will be updated with the new max age.
   */
  cookieToDecrypted(cookieStore: ReadonlyRequestCookies, name: string, newMaxAge?: number) {
    const cookie = cookieStore.get(name);
    if (!cookie) throw new Error("No cookie found");
    const data = this.decrypt(cookie.value);

    if (newMaxAge) this.encryptedToCookie(cookieStore, name, data, newMaxAge);
    return data;
  }
}
