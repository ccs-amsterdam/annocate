import { VariantProps } from "class-variance-authority";
import { ButtonProps } from "./button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { useState } from "react";
import { Input } from "./input";

interface Props {
  children: React.ReactNode;
  title: string;
  message: string;
  enterText?: string;
  onAccept: () => void;
}

export function ConfirmDialog({ children, title, message, enterText, onAccept }: Props) {
  const [text, setText] = useState("");
  const ready = !enterText || text === enterText;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex items-end">
          {enterText ? (
            <div className="mr-auto w-56">
              <div className="mb-1 text-sm font-normal text-foreground/70">
                Enter <span className="text-base text-primary">{enterText}</span> to confirm
              </div>
              <Input
                placeholder={`enter confirmation text`}
                className={ready ? "bg-primary/10" : "bg-destructive/10"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          ) : null}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!ready} onClick={onAccept}>
            Yes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
