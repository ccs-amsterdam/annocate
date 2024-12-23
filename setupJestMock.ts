import { queryClient } from "@/drizzle/drizzle";

var COOKIES: Record<string, string> = {};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    get: (name: string) => {
      const value = COOKIES[name];
      return { name, value };
    },
    set: (name: string, value: string, params: any) => {
      COOKIES[name] = value;
      return;
    },
  })),
}));

afterAll(() => {
  // how to close depends on the client. "end" works for pg, but not for Neon (which shouldn't be used for testing)
  if ("end" in queryClient) queryClient.end();
});
