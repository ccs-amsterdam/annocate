"use client";

import { useMutateUsers } from "@/app/api/users/query";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { FieldValues, Path, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Button } from "../ui/button";
import { UsersPostBody, UsersPostBodySchema } from "@/app/api/users/schemas";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Plus } from "lucide-react";
import { z } from "zod";

interface CreateProps<T> {
  schema: z.ZodType<T>;
  defaultValues: T;
  mutateAsync: (body: T) => Promise<any>;
  afterSubmit?: () => void;
}

interface CreateDialogProps<T> extends CreateProps<T> {
  children: React.ReactNode;
}

export function CreateDialog<T extends FieldValues>({ children, ...props }: CreateDialogProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild className="flex">
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create ...</DialogTitle>
        </DialogHeader>
        <Create
          {...props}
          afterSubmit={() => {
            setOpen(false);
            if (props.afterSubmit) props.afterSubmit();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// Alternative: don't use the zod schema to generate the form. Use a custom object array

export function Create<T extends FieldValues>({ schema, mutateAsync, defaultValues, afterSubmit }: CreateProps<T>) {
  const form = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues,
  });

  function onSubmit(values: T) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  function radioForm(name: string, zodField: z.ZodEnum) {
    console.log(zodField);
    return (
      <FormField
        key={name}
        control={form.control}
        name={name as Path<T>}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel className="mt-0">Role</FormLabel>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                {Object.entries(zodField.enum).map(([key, value]) => (
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value={key} />
                    </FormControl>
                    <FormLabel className="w-14 font-normal">{key}</FormLabel>
                    <FormDescription>{value}</FormDescription>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            {/* <div>
                <FormDescription>Should this user have Admin priviledges? </FormDescription>
                <FormMessage />
              </div> */}
          </FormItem>
        )}
      />
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {Object.entries(schema.shape).map(([key, value]) => {
          if (value instanceof z.ZodNativeEnum) return radioForm(key, value);
          return null;
        })}
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
