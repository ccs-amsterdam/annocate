import { queryClient } from "@/drizzle/drizzle";

// MOCKING NEXT HEADERS: We need to mock any next/headers that next injects within the "request scope".

// MOCKING COOKIES: We need cookies to be functional, because they are used for annotator sessions
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

// TEARDOWN

afterAll(() => {
  // We need to close the db connection after all tests are done
  // how to close depends on the client. "end" works for pg, but not for Neon (which shouldn't be used for testing)
  // (and this way typescript is happy)
  if ("end" in queryClient) queryClient.end();
});
