"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ReactNode, useState } from "react";
import { Control, FieldValues, Path, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "../ui/form";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Input } from "../ui/input";
import { get } from "http";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { HelpCircle } from "lucide-react";

interface FormFieldProps<T extends FieldValues, Z> {
  control: Control<T, any>;
  name: Path<T>;
  zType: z.ZodType<Z>;
}

interface FormFieldArrayProps<T extends FieldValues, Z extends string> extends FormFieldProps<T, Z> {
  values: { value: Z; label: string }[];
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
  console.log(openAPI);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-0">
              {values?.map((value) => (
                <FormItem key={value.value} className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value={value.value} />
                  </FormControl>
                  <FormLabel className="w-14 font-normal">{value.label}</FormLabel>
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
  return (
    <div className="flex items-center gap-3">
      <FormLabel>{title}</FormLabel>
      <Popover>
        <PopoverTrigger>
          <HelpCircle className="h-5 w-5 text-foreground/50 hover:text-primary" />
        </PopoverTrigger>
        <PopoverContent>{description}</PopoverContent>
      </Popover>
    </div>
  );
}

// export function radioForm();
