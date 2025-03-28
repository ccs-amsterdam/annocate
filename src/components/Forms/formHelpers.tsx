import {
  CodebookCodeSchema,
  CodebookVariableItemSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/variableSchemas";
import {
  ChevronDown,
  ChevronRight,
  LucideMessageCircleQuestion,
  MessageCircleQuestionIcon,
  Plus,
  PlusIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Control, ControllerRenderProps, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField } from "../ui/form";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { SelectOrCreate } from "../ui/select-or-create";
import { Popover, PopoverContent, PopoverTrigger } from "@radix-ui/react-popover";
import DBSelect from "../Common/DBSelect";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "../ui/dialog";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "../ui/tooltip";

export interface FormOptions {
  value: string | null;
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
  disableMessage?: boolean;
  hideTitle?: boolean;
}

interface FormFieldArrayProps<T extends FieldValues> extends FormFieldProps<T> {
  values: FormOptions[];
  labelWidth?: string;
  variant?: "default" | "secondary" | "destructive" | "ghost" | "outline";
}

interface CodeFormProps<T extends FieldValues> extends FormFieldProps<T> {
  form?: UseFormReturn<any>;
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
          <FormFieldTitle title={openAPI.title} description={openAPI.description} required={!zType.isOptional()} />
          <FormControl>
            <Input
              placeholder={placeholder || openAPI.example || ""}
              {...field}
              value={field.value || ""}
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
            <FormFieldTitle title={openAPI.title} description={openAPI.description} required={!zType.isOptional()} />
            <div className="flex">
              <FormControl>
                <Input
                  type="number"
                  min={min}
                  max={max}
                  placeholder={openAPI.example}
                  value={field.value == null ? "" : field.value}
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
  hideTitle,
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
              const target = e.target as HTMLTextAreaElement;
              const array = target.value.split("\n");
              onChange(array);
            }
          : onChange;

        return (
          <FormItem className="flex h-full flex-col">
            <FormFieldTitle
              title={openAPI.title}
              description={openAPI.description}
              hideTitle={hideTitle}
              required={!zType.isOptional()}
            />
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
      <FormField
        control={control}
        name={name}
        render={({ field }) => {
          return (
            <FormItem className="flex select-none flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormFieldTitle title={openAPI.title} description={openAPI.description} required={!zType.isOptional()} />
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
          <FormFieldTitle
            title={openAPI?.title || name}
            description={openAPI?.description}
            required={!zType.isOptional()}
          />
          <FormControl>
            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-0">
              {values?.map((value) => (
                <FormItem key={value.value} className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value={value.value ?? ""} />
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
  disableMessage,
  hideTitle,
  variant,
}: FormFieldArrayProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const fieldLabel = values.find((v) => v.value === field.value)?.label || placeholder;
        return (
          <FormItem className="flex flex-col">
            <FormFieldTitle
              title={openAPI.title}
              description={openAPI.description}
              disableMessage={disableMessage}
              required={!zType.isOptional()}
              hideTitle={hideTitle}
            />
            <FormControl>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant={variant || "default"} className="flex w-full items-center justify-between gap-2">
                    {fieldLabel}

                    <ChevronDown className="h-5 w-5 text-primary-foreground hover:text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="flex max-w-lg flex-col gap-1 p-1" align="start" side="bottom">
                  {values.map((value) => (
                    <DropdownMenuItem
                      key={value.value}
                      onClick={() => {
                        field.onChange(value.value);
                      }}
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
        );
      }}
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
          <FormFieldTitle title={openAPI.title} description={openAPI.description} required={!zType.isOptional()} />
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

export function CodesFormField<T extends FieldValues>({
  form,
  control,
  name,
  zType,
  swipe,
  hideTitle,
}: CodeFormProps<T>) {
  const openAPI = OpenAPIMeta(zType, name);
  const test = useFormField();

  const maxLines = swipe ? 3 : undefined;

  function addCode(field: ControllerRenderProps<T>, values: CodebookCode[]) {
    values.push({ code: "New code", value: undefined, color: "" });
    field.onChange(values);
  }

  function rmCode(field: ControllerRenderProps<T>, values: CodebookCode[], index: number) {
    values.splice(index, 1);
    field.onChange(values);
  }

  function moveCode(field: ControllerRenderProps<T>, values: CodebookCode[], i: number, j: number) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    field.onChange(values);
  }

  const inputStyle = "h-7 px-2 rounded-none focus-visible:ring-0 border-0 rounded ";
  const cellStyle = "py-1 px-1 rounded-none hover:bg-transparent";
  const tableHeadStyle = "h-8 px-3 py-1 text-foreground text-base  ";

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const codes = field.value || ([] as CodebookCode[]);

        return (
          <FormItem className="flex flex-col">
            <FormFieldTitle
              title={openAPI.title}
              description={openAPI.description}
              hideTitle={hideTitle}
              required={!zType.isOptional()}
            />
            <FormControl>
              <Table>
                <TableHeader className="border-">
                  <TableRow className="border-none p-0">
                    <TableHead className={`${tableHeadStyle} w-3 rounded-l`}></TableHead>
                    <TableHead className={`${tableHeadStyle} `}>
                      Code{"  "}
                      <span className="opacity-50">*</span>
                    </TableHead>
                    <TableHead className={`${tableHeadStyle} w-24`}> Value</TableHead>
                    <TableHead className={`${tableHeadStyle} w-28`}> Color</TableHead>
                    <TableHead className={`${tableHeadStyle} w-3 rounded-r`}></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="">
                  {codes.map((code, i) => {
                    const codeState = form?.getFieldState(`block.codes[${i}]`);
                    const codeError = "code" in (codeState?.error || {});
                    const valueError = "value" in (codeState?.error || {});
                    const colorError = "color" in (codeState?.error || {});
                    const codeInputStyle = codeError ? `${inputStyle} bg-destructive` : `${inputStyle} bg-primary/30`;
                    const valueInputStyle = valueError ? `${inputStyle} bg-destructive` : `${inputStyle} bg-primary/30`;
                    const colorInputStyle = colorError ? `${inputStyle} bg-destructive` : `${inputStyle} bg-primary/30`;

                    if (maxLines && i >= maxLines) return null;
                    return (
                      <TableRow key={i} className="border-none hover:bg-transparent">
                        <TableCell className={cellStyle}>
                          <MoveItemInArray
                            move={(i, j) => moveCode(field, codes, i, j)}
                            i={i}
                            n={codes.length}
                            bg="bg-background"
                            error={codeState?.invalid}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={codeInputStyle}
                            value={code.code}
                            onChange={(v) => {
                              codes[i].code = v.target.value;
                              field.onChange(codes);
                            }}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={valueInputStyle}
                            type="number"
                            value={String(code.value) || ""}
                            onChange={(v) => {
                              codes[i].value = Number(v.target.value);
                              field.onChange(codes);
                            }}
                          />
                        </TableCell>
                        <TableCell className={cellStyle}>
                          <Input
                            className={colorInputStyle}
                            value={String(code.color) || ""}
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
            <Button
              variant={codes.length > 0 ? "ghost" : "default"}
              onClick={(e) => {
                e.preventDefault();
                addCode(field, codes);
              }}
            >
              {codes.length > 0 ? "Add Code" : "Create codes"}
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
            <FormFieldTitle title={openAPI.title} description={openAPI.description} required={!zType.isOptional()} />
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

export function OpenAPIMeta(zType: z.ZodTypeAny, name: string) {
  return zType._def?.openapi?.metadata || { title: name, description: "" };
}

export function FormFieldTitle({
  title,
  description,
  disableMessage,
  hideTitle,
  required,
}: {
  title: string;
  description: string;
  disableMessage?: boolean;
  hideTitle?: boolean;
  required?: boolean;
}) {
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

  return (
    <div>
      <div className={`flex items-center gap-1 ${hideTitle ? "hidden" : ""}`}>
        <Tooltip delayDuration={200}>
          <TooltipTrigger
            tabIndex={-1}
            className="flex items-center gap-[1px] font-normal"
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            {title}
            {required ? <span className="font-sm opacity-70">*</span> : null}
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="top" sideOffset={3} className="w-[400px]">
              {description}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </div>
      {disableMessage ? null : <FormMessage className="mt-1" />}
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
  bg?: string;
  error?: boolean;
  variant?: "default" | "secondary";
}) {
  const itemArray = Array.from({ length: n }, (_, i) => i);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={n === 1}>
        <Button variant={!!error ? "destructive" : variant || "default"} size="icon" className={`h-6 w-6 rounded-full`}>
          {i + 1}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={`flex items-center gap-[11px] overflow-auto rounded-none border-none pl-3 text-secondary shadow-none ${bg || ""} `}
        side="right"
        sideOffset={8}
      >
        move to
        {itemArray.map((j) => {
          if (j === i) return null;
          return (
            <DropdownMenuItem key={j} onClick={() => move(i, j)} className="p-0">
              <Button variant="secondary" size="icon" className="h-6 w-6 rounded-full hover:border-none">
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
