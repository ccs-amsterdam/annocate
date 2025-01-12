import { typesafeCookieSession } from "@/functions/typesafeEncrypt";
import { cookies } from "next/headers";
import { z } from "zod";

/**
Keep a session:
- user can annotate for this annotatorId
*/

const AnnotatorSessionEncryptor = new typesafeCookieSession(
  z.object({
    annotatorId: z.number(),
  }),
);

export async function getAnnotatorSession(annotatorId: number) {
  const cookieStore = await cookies();

  try {
    const session = AnnotatorSessionEncryptor.cookieToDecrypted(cookieStore, "annotatorSession", 60 * 60 * 24 * 7);
    if (session.annotatorId === annotatorId) return session;
  } catch (e) {
    console.log("expired");
  }

  return null;
}

export async function setAnnotatorSession(annotatorId: number) {
  const cookieStore = await cookies();
  AnnotatorSessionEncryptor.encryptedToCookie(cookieStore, "annotatorSession", { annotatorId }, 60 * 60 * 24 * 7);
}
