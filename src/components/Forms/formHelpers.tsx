"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Control, FieldValues, Path } from "react-hook-form";
import { z } from "zod";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "../ui/form";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export interface FormOptions {
  value: string;
  label: string;
  description?: string;
}

interface FormFieldProps<T extends FieldValues, Z> {
  control: Control<T, any>;
  name: Path<T>;
  zType: z.ZodType<Z>;
}

interface FormFieldArrayProps<T extends FieldValues, Z extends string> extends FormFieldProps<T, Z> {
  values: FormOptions[];
}

export function TextFormField<T extends FieldValues, Z>({ control, name, zType }: FormFieldProps<T, Z>) {
  const openAPI = getOpenApi(zType);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <Input placeholder={openAPI.example} {...field} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export function RadioFormField<T extends FieldValues, Z extends string>({
  control,
  name,
  zType,
  values,
}: FormFieldArrayProps<T, Z>) {
  const openAPI = getOpenApi(zType);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title || name} description={openAPI.description} />
          <FormControl>
            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-0">
              {values?.map((value) => (
                <FormItem key={value.value} className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value={value.value} />
                  </FormControl>
                  <FormLabel className="w-20 font-normal">{value.label}</FormLabel>
                  {value.description ? <FormDescription className="w-full">{value.description}</FormDescription> : null}
                </FormItem>
              ))}
            </RadioGroup>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function getOpenApi(zType: z.ZodTypeAny) {
  return zType._def?.openapi?.metadata;
}

function Title({ title, description }: { title: string; description: string }) {
  const [showDescription, setShowDescription] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function descriptionStyle(showDescription: boolean) {
    if (!showDescription || !ref.current)
      return {
        maxHeight: "0",
      };
    const descriptionHeight = ref.current?.scrollHeight;
    return {
      maxHeight: `${descriptionHeight}px`,
    };
  }

  const chevron = !showDescription ? (
    <ChevronRight className="h-5 w-5 text-foreground/50 hover:text-primary" />
  ) : (
    <ChevronDown className="h-5 w-5 text-foreground/50 hover:text-primary" />
  );

  return (
    <>
      <div
        className="flex items-center gap-3"
        onClick={() => {
          if (description) setShowDescription(!showDescription);
        }}
      >
        <FormLabel>{title}</FormLabel>
        {description ? chevron : null}
      </div>
      <FormDescription ref={ref} className="overflow-hidden transition-all" style={descriptionStyle(showDescription)}>
        {description}
      </FormDescription>
    </>
  );
}

// export function radioForm();
