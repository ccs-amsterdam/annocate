import { useEffect, useState } from "react";

/** used to make sure component is running on client.
 * Mainly used to avoid rehydration error:
 * https://nextjs.org/docs/messages/react-hydration-error
 */
export default function useIsClient() {
  const [isClient, setClient] = useState(false);

  useEffect(() => {
    setClient(true);
  }, []);
  return isClient;
}
