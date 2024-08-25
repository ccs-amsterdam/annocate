"use client";

import {
  CodebookCodeSchema,
  CodebookVariableItemSchema,
} from "@/app/api/projects/[projectId]/codebooks/variablesSchemas";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Control, FieldValues, Path } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { SelectOrCreate } from "../ui/select-or-create";
import { useCreateEmptyCodebook } from "./codebookForms";
import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { JobBlock, JobBlockMeta } from "@/app/types";
import { Popover, PopoverContent, PopoverTrigger } from "@radix-ui/react-popover";
import DBSelect from "../Common/DBSelect";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "../ui/dialog";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";

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
  clearable?: boolean;
  className?: string;
  placeholder?: string;
}

interface FormFieldArrayProps<T extends FieldValues> extends FormFieldProps<T> {
  values: FormOptions[];
  labelWidth?: string;
}

interface CodeFormProps<T extends FieldValues> extends FormFieldProps<T> {
  swipe?: boolean;
}

export function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onClear}>
      <X />
    </Button>
  );
}

export function TextFormField<T extends FieldValues>({
  control,
  name,
  zType,
  onChangeInterceptor,
  className,
  placeholder,
}: FormFieldProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormFieldTitle title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <Input
              placeholder={placeholder || openAPI.example}
              {...field}
              onChange={(e) => {
                if (onChangeInterceptor) e.target.value = onChangeInterceptor(e.target.value);
                field.onChange(e.target.value);
              }}
              className={className}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

interface NumberFormProps<T extends FieldValues> extends FormFieldProps<T> {
  min?: number;
  max?: number;
}

export function NumberFormField<T extends FieldValues>({
  control,
  name,
  zType,
  clearable,
  min,
  max,
  className,
}: NumberFormProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        return (
          <FormItem className="flex flex-col">
            <FormFieldTitle title={openAPI.title} description={openAPI.description} />
            <div className="flex ">
              <FormControl>
                <Input
                  type="number"
                  min={min}
                  max={max}
                  placeholder={openAPI.example}
                  value={field.value === null ? "" : field.value}
                  onChange={(e) => {
                    const value = e.target.value;
                    field.onChange(Number(value));
                  }}
                  className={`${className} w-20`}
                />
              </FormControl>
              {clearable ? (
                <ClearButton
                  onClear={() => {
                    field.onChange(null);
                  }}
                />
              ) : null}
            </div>
          </FormItem>
        );
      }}
    />
  );
}

interface TextAreaFormProps<T extends FieldValues> extends FormFieldProps<T> {
  asArray?: boolean;
}

export function TextAreaFormField<T extends FieldValues>({
  control,
  name,
  zType,
  className,
  placeholder,
  asArray,
}: TextAreaFormProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const { value, onChange, ...props } = field;

        const realValue = asArray ? (value as string[]).join("\n") : value;
        const realOnChange = asArray
          ? (e: any) => {
              const array = e.target.value.split("\n");
              onChange(array);
            }
          : onChange;

        return (
          <FormItem className="flex h-full flex-col">
            <FormFieldTitle title={openAPI.title} description={openAPI.description} />
            <FormControl>
              <Textarea
                placeholder={placeholder || openAPI.example}
                {...props}
                onChange={realOnChange}
                value={realValue}
                className={className}
              />
            </FormControl>
          </FormItem>
        );
      }}
    />
  );
}

export function BooleanFormField<T extends FieldValues>({ control, name, zType }: FormFieldProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);
  return (
    <div className="flex flex-col gap-2">
      <FormFieldTitle title={openAPI.title} description={openAPI.description} />
      <FormField
        control={control}
        name={name}
        render={({ field }) => {
          return (
            <FormItem className="flex select-none flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          );
        }}
      />
    </div>
  );
}

export function RadioFormField<T extends FieldValues, Z extends string>({
  control,
  name,
  zType,
  values,
  labelWidth = "6rem",
}: FormFieldArrayProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormFieldTitle title={openAPI?.title || name} description={openAPI?.description} />
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

export function DropdownFormField<T extends FieldValues>({
  control,
  name,
  zType,
  values,
  placeholder,
}: FormFieldArrayProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormFieldTitle title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button className="flex w-full items-center justify-between gap-2">
                  {field.value || placeholder}

                  <ChevronDown className="h-5 w-5 text-primary-foreground hover:text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="flex max-w-lg flex-col gap-1 p-1" align="start" side="bottom">
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

export function SelectOrCreateForm<T extends FieldValues>({ control, name, zType, values }: FormFieldArrayProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormFieldTitle title={openAPI.title} description={openAPI.description} />
          <FormControl>
            <SelectOrCreate
              options={values}
              optionKey="label"
              createMessage="Create new layout"
              value={values.find((v) => v.value === field.value)?.label}
              onValueChange={(option, value) => field.onChange(value)}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

type CodebookCode = z.infer<typeof CodebookCodeSchema>;

export function CodesFormField<T extends FieldValues>({ control, name, zType, swipe }: CodeFormProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);

  const maxLines = swipe ? 3 : undefined;

  function addCode(field: any, values: CodebookCode[]) {
    values.push({ code: "New code", value: undefined, color: "" });
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

        return (
          <FormItem className="flex flex-col">
            <FormFieldTitle title={openAPI.title} description={openAPI.description} />
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
                            onChange={(v) => {
                              codes[i].code = v.target.value;
                              field.onChange(codes);
                            }}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            type="number"
                            value={String(code.value)}
                            onChange={(v) => {
                              codes[i].value = Number(v.target.value);
                              field.onChange(codes);
                            }}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={inputStyle}
                            value={String(code.color)}
                            onChange={(v) => {
                              codes[i].color = v.target.value;
                              field.onChange(codes);
                            }}
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
  const openAPI = OpenAPIMeta(zType, name);

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
        function setItem(index: number, key: "name" | "label", value: string) {
          items[index][key] = value;
          field.onChange(items);
        }

        return (
          <FormItem className="flex flex-col">
            <FormFieldTitle title={openAPI.title} description={openAPI.description} />
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

interface SelectCodebookProps<T extends FieldValues> {
  control: Control<T, any>;
  name: Path<T>;
  zType: z.ZodTypeAny;
  projectId: number;
  type: "survey" | "annotation";
  current?: JobBlock;
}

export function SelectCodebookFormField<T extends FieldValues>({
  control,
  name,
  zType,
  projectId,
  type,
  current,
}: SelectCodebookProps<T>) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(current?.codebookName || "");
  const useCodebooksProps = useCodebooks(projectId, { type });
  const [newName, setNewName] = useState("");
  const { create } = useCreateEmptyCodebook(projectId, type);
  const openAPI = OpenAPIMeta(zType, "codebookId");

  useEffect(() => {
    if (current) {
      setSelected(current.codebookName);
    }
  }, [current]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        function onSelect(id: number, name: string) {
          setSelected(name);
          field.onChange(id);
          setOpen(false);
        }

        return (
          <FormItem>
            <FormFieldTitle title={openAPI.title} description={openAPI.description} />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className=" flex w-full min-w-48 items-center justify-between  gap-2">
                  {selected || "Select Codebook"} <ChevronDown />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-72 bg-background">
                <DialogHeader>
                  <DialogTitle className="invisible h-0">Select codebook</DialogTitle>
                  <DialogDescription>Select or create codebook</DialogDescription>
                </DialogHeader>
                <DBSelect
                  {...useCodebooksProps}
                  nameField={"name"}
                  projectId={projectId}
                  onSelect={(codebook) => onSelect(codebook.id, codebook.name)}
                >
                  <div className="flex items-center gap-2">
                    <Input placeholder="New codebook" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <Button
                      disabled={!newName}
                      className="ml-auto flex  w-min gap-1"
                      variant="secondary"
                      onClick={() =>
                        create(newName).then(({ id }) => {
                          onSelect(id, newName);
                        })
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                </DBSelect>
              </DialogContent>
            </Dialog>
          </FormItem>
        );
      }}
    />
  );
}

export function OpenAPIMeta(zType: z.ZodTypeAny, name: string) {
  return zType._def?.openapi?.metadata || { title: name, description: "" };
}

export function FormFieldTitle({ title, description }: { title: string; description: string }) {
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
  error?: boolean;
  variant?: "default" | "secondary";
}) {
  const itemArray = Array.from({ length: n }, (_, i) => i);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={n === 1}>
        <Button variant={!!error ? "destructive" : variant || "default"} className={` h-8 w-8 rounded-full `}>
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
