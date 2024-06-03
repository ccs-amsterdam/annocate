"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { Control, FieldValues, Path } from "react-hook-form";
import { z } from "zod";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField } from "../ui/form";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import {
  CodebookCodeSchema,
  CodebookCodesSchema,
  CodebookCreateBodySchema,
  CodebookVariableItemSchema,
} from "@/app/api/projects/[projectId]/codebook/schemas";
import { createDecipheriv } from "crypto";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "../ui/table";

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

interface CodeFormProps<T extends FieldValues> extends FormFieldProps<T> {
  swipe?: boolean;
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

export function TextAreaFormField<T extends FieldValues>({ control, name, zType }: FormFieldProps<T>) {
  const openAPI = getOpenApi(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <Title title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <Textarea placeholder={openAPI.example} {...field} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export function BooleanFormField<T extends FieldValues>({ control, name, zType }: FormFieldProps<T>) {
  const openAPI = getOpenApi(zType, name);
  return (
    <>
      <Title title={openAPI.title} description={openAPI.description} />
      <FormField
        control={control}
        name={name}
        render={({ field }) => {
          return (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="italic ">{field.value ? "enabled" : "disabled"}</FormLabel>
              </div>
            </FormItem>
          );
        }}
      />
    </>
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

type CodebookCode = z.infer<typeof CodebookCodeSchema>;

export function CodesFormField<T extends FieldValues>({ control, name, zType, swipe }: CodeFormProps<T>) {
  const openAPI = getOpenApi(zType, name);

  const maxLines = swipe ? 3 : undefined;

  function addCode(field: any, values: CodebookCode[]) {
    values.push({ code: "New code", value: "", color: "" });
    field.onChange(values);
  }

  function rmCode(field: any, values: CodebookCode[], index: number) {
    values.splice(index, 1);
    field.onChange(values);
  }

  function moveCode(field: any, values: CodebookCode[], i: number, j: number) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    field.onChange(values);
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const codes = field.value || ([] as CodebookCode[]);
        function setCode(index: number, key: "code" | "value" | "color", value: string) {
          codes[index][key] = value;
          field.onChange(codes);
        }

        return (
          <FormItem className="flex flex-col">
            <Title title={openAPI.title} description={openAPI.description} />
            <FormControl>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-3"></TableHead>
                    <TableHead className="h-6 w-1/2 px-3 py-1">Code</TableHead>
                    <TableHead className="h-6 px-3 py-1">Value</TableHead>
                    <TableHead className="h-6 px-3 py-1">Color</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code, i) => {
                    if (maxLines && i >= maxLines) return null;
                    const inputStyle = "h-7 rounded-none focus-visible:ring-0";
                    const cellStyle = "p-1 rounded-none hover:bg-transparent ";
                    return (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell className={cellStyle}>
                          <MoveItemInArray
                            move={(i, j) => moveCode(field, codes, i, j)}
                            i={i}
                            n={codes.length}
                            bg="bg-primary-light"
                            error={false}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={code.code}
                            onChange={(v) => setCode(i, "code", v.target.value)}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={String(code.value)}
                            onChange={(v) => setCode(i, "value", v.target.value)}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={String(code.color)}
                            onChange={(v) => setCode(i, "color", v.target.value)}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <X
                            className="h-5 w-5 cursor-pointer text-foreground/50 hover:text-destructive"
                            onClick={() => rmCode(field, codes, i)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </FormControl>
            <Button type="button" onClick={() => addCode(field, codes)}>
              Add code
            </Button>
          </FormItem>
        );
      }}
    />
  );
}

type CodebookVariableItem = z.infer<typeof CodebookVariableItemSchema>;

export function VariableItemsFormField<T extends FieldValues>({ control, name, zType, swipe }: CodeFormProps<T>) {
  const openAPI = getOpenApi(zType, name);

  const maxLines = swipe ? 3 : undefined;

  function addVariable(field: any, values: CodebookVariableItem[]) {
    values.push({ name: "new_item", label: "" });
    field.onChange(values);
  }

  function rmVariable(field: any, values: CodebookVariableItem[], index: number) {
    values.splice(index, 1);
    field.onChange(values);
  }

  function moveVariable(field: any, values: CodebookVariableItem[], i: number, j: number) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    field.onChange(values);
  }

  function forceAlphaNumeric(value: string) {
    return value.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const items = field.value || ([] as CodebookVariableItem[]);
        console.log(items);
        function setItem(index: number, key: "name" | "label", value: string) {
          items[index][key] = value;
          field.onChange(items);
        }

        return (
          <FormItem className="flex flex-col">
            <Title title={openAPI.title} description={openAPI.description} />
            <FormControl>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-3"></TableHead>
                    <TableHead className="h-6 px-3 py-1">Name</TableHead>
                    <TableHead className="h-6 w-2/3 px-3 py-1">Label</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    if (maxLines && i >= maxLines) return null;
                    const inputStyle = "h-7 rounded-none focus-visible:ring-0";
                    const cellStyle = "p-1 rounded-none hover:bg-transparent ";
                    return (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell className={cellStyle}>
                          <MoveItemInArray
                            move={(i, j) => moveVariable(field, items, i, j)}
                            i={i}
                            n={items.length}
                            bg="bg-primary-light"
                            error={false}
                            variant="secondary"
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={item.name}
                            onChange={(v) => setItem(i, "name", forceAlphaNumeric(v.target.value))}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={String(item.label)}
                            onChange={(v) => setItem(i, "label", v.target.value)}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <X
                            className="h-5 w-5 cursor-pointer text-foreground/50 hover:text-destructive"
                            onClick={() => rmVariable(field, items, i)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </FormControl>
            <Button type="button" variant="secondary" onClick={() => addVariable(field, items)}>
              Add Item
            </Button>
          </FormItem>
        );
      }}
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

export function MoveItemInArray({
  move,
  i,
  n,
  bg,
  error,
  variant,
}: {
  move: (index1: number, index2: number) => void;
  i: number;
  n: number;
  bg: string;
  error: boolean;
  variant?: "default" | "secondary";
}) {
  const itemArray = Array.from({ length: n }, (_, i) => i);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={n === 1}>
        <Button variant={error ? "destructive" : variant || "default"} className={` h-8 w-8 rounded-full `}>
          {i + 1}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`flex min-w-72 items-center gap-[11px] overflow-auto border-none shadow-none ${bg} `}
        side="right"
        sideOffset={8}
      >
        move to
        {itemArray.map((j) => {
          if (j === i) return null;
          return (
            <DropdownMenuItem key={j} onClick={() => move(i, j)} className="p-0">
              <Button variant="secondary" className="h-8 w-8 rounded-full hover:border-none ">
                {j + 1}
              </Button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// export function radioForm();
