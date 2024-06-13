import { useUpdateUnitset } from "@/app/api/projects/[projectId]/units/query";
import { UnitsetResponseSchema, UnitsetsUpdateBodySchema } from "@/app/api/projects/[projectId]/units/unitsets/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "../ui/form";
import React from "react";
import { TextFormField } from "./formHelpers";
import { z } from "zod";
import { useUnitLayouts } from "@/app/api/projects/[projectId]/units/layouts/query";

type UnitsetUpdateBody = z.input<typeof UnitsetsUpdateBodySchema>;

interface UpdateUnitsetProps {
  projectId: number;
  current: z.infer<typeof UnitsetResponseSchema>;
  afterSubmit?: () => void;
}

export const UpdateUnitset = React.memo(function UpdateUnitset({
  projectId,
  current,
  afterSubmit,
}: UpdateUnitsetProps) {
  const { mutateAsync } = useUpdateUnitset(projectId, current.id);
  const { data: layouts } = useUnitLayouts(projectId, {});
  const form = useForm<UnitsetUpdateBody>({
    resolver: zodResolver(UnitsetsUpdateBodySchema),
    defaultValues: UnitsetsUpdateBodySchema.parse(current),
  });

  function onSubmit(values: UnitsetUpdateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
    afterSubmit?.();
  }

  const shape = UnitsetsUpdateBodySchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <TextFormField control={form.control} zType={shape.layout} name="layout" />
      </form>
    </Form>
  );
});
