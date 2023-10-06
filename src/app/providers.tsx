"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MiddlecatProvider } from "middlecat-react";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <MiddlecatProvider bff="/api/bffAuth" fixedResource="api">
        {children}
      </MiddlecatProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
