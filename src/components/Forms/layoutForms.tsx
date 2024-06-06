import { useCreateUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";
import { useCallback } from "react";

export function useCreateEmptyLayout(projectId: number) {
  const { mutateAsync } = useCreateUnitLayout(projectId);

  const create = useCallback(
    (name: string) => {
      const newLayout = {
        name,
        layout: {
          fields: [],
          variables: {},
          grid: {
            areas: [],
            rows: [],
            columns: [],
          },
        },
      };
      return mutateAsync(newLayout);
    },
    [mutateAsync],
  );

  return { create };
}
