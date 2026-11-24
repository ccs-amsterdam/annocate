import { useState } from "react";
import { MAX_TEXT_LENGTH } from "@annotinder/contracts";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShortcutBadge } from "../ShortcutBadge";
import { COMMAND_BADGES } from "../../keyboard/commands";
import { continuesText } from "./fieldKeys";

type TextVariable = Extract<QuestionVariable, { type: "text" }>;

/**
 * An open answer: one line, where Enter continues, or (`multiline`) a text
 * area, where Enter is a new line and Ctrl + Enter continues. Continue needs
 * some text.
 */
export function TextAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<TextVariable>) {
  const given = initialValue?.values?.[0]?.value;
  const [text, setText] = useState(typeof given === "string" ? given : "");
  const max = variable.maxLength ?? MAX_TEXT_LENGTH;
  const ready = text.trim().length > 0;
  const submit = () => {
    if (ready) onAnswer({ done: true, skip: false, values: [{ value: text.trim() }] });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!continuesText(e.nativeEvent, !!variable.multiline)) return;
    e.preventDefault();
    submit();
  };
  return (
    <div className="flex flex-col gap-2 pt-1">
      {variable.multiline ? (
        <Textarea
          aria-label="Your answer"
          autoFocus
          value={text}
          maxLength={max}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-28"
        />
      ) : (
        <Input
          aria-label="Your answer"
          autoFocus
          value={text}
          maxLength={max}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {variable.multiline ? "Ctrl + Enter to continue" : "Enter to continue"}
          {text.length > max * 0.8 && ` · ${max - text.length} characters left`}
        </span>
        <Button type="button" className="relative" disabled={!ready} onClick={submit}>
          {variable.multiline && ready && <ShortcutBadge shortcut={COMMAND_BADGES.continue} />}
          Continue
        </Button>
      </div>
    </div>
  );
}
