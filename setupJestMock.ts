
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    get: (name: string) => {
      return null;
    },
    set: (name: string, value: any) => {
      return;
    },
  })),
}));
