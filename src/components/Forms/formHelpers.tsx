"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Control, FieldValues, Path } from "react-hook-form";
import { z } from "zod";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField } from "../ui/form";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";

export interface FormOptions {
  value: string;
  label: string;
  description?: string;
}

interface FormFieldProps<T extends FieldValues> {
  control: Control<T, any>;
  name: Path<T>;
  zType: z.ZodTypeAny;
  onChangeInterceptor?: (value: any) => any;
}

interface FormFieldArrayProps<T extends FieldValues> extends FormFieldProps<T> {
  values: FormOptions[];
  labelWidth?: string;
}

export function TextFormField<T extends FieldValues>({ control, name, zType, onChangeInterceptor }: FormFieldProps<T>) {
  const openAPI = getOpenApi(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <Input
              placeholder={openAPI.example}
              {...field}
              onChange={(e) => {
                if (onChangeInterceptor) e.target.value = onChangeInterceptor(e.target.value);
                field.onChange(e.target.value);
              }}
            />
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
  labelWidth = "6rem",
}: FormFieldArrayProps<T>) {
  const openAPI = getOpenApi(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI?.title || name} description={openAPI?.description} />
          <FormControl>
            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-0">
              {values?.map((value) => (
                <FormItem key={value.value} className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value={value.value} />
                  </FormControl>
                  <FormLabel style={{ width: labelWidth }} className="font-normal">
                    {value.label}
                  </FormLabel>
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

export function DropdownFormField<T extends FieldValues>({ control, name, zType, values }: FormFieldArrayProps<T>) {
  const openAPI = getOpenApi(zType, name);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button className="flex w-full items-center justify-between gap-2">
                  {field.value}

                  <ChevronDown className="h-5 w-5 text-primary-foreground hover:text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="flex flex-col gap-1 p-1" align="start" side="bottom">
                {values.map((value) => (
                  <DropdownMenuItem
                    key={value.value}
                    onClick={() => field.onChange(value.value)}
                    className="flex flex-col items-start p-1"
                  >
                    <div className="font-bold">{value.label}</div>
                    <div className="text-foreground/70">{value.description}</div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function getOpenApi(zType: z.ZodTypeAny, name: string) {
  return zType._def?.openapi?.metadata || { title: name, description: "" };
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
      margin: "0.5rem 0 0.5rem 0",
    };
  }

  const chevron = !showDescription ? (
    <ChevronRight className="h-5 w-5 text-foreground/50 hover:text-primary" />
  ) : (
    <ChevronDown className="h-5 w-5 text-foreground/50 hover:text-primary" />
  );
  return (
    <div>
      <div
        className="flex items-center gap-1"
        onClick={() => {
          if (description) setShowDescription(!showDescription);
        }}
      >
        <FormLabel>{title}</FormLabel>
        {description ? chevron : null}
        <FormMessage className="ml-2" />
      </div>
      <FormDescription ref={ref} className="overflow-hidden transition-all" style={descriptionStyle(showDescription)}>
        {description}
      </FormDescription>
    </div>
  );
}

// export function radioForm();
