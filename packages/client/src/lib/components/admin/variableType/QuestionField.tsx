import { MarkdownField } from "../MarkdownField";

/**
 * The question text, which every asked answer type has: one line, or more
 * with formatting (a text of several lines opens that way). Its value is a
 * plain `{ question }` shape rather than one derived from the variable
 * union, so a patch doesn't widen back into every variant's fields.
 * (A loop question's instruction is the item's: ItemForm.)
 */
export function QuestionField({
  value,
  onChange,
}: {
  value: { question: string };
  onChange: (patch: { question: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Question</label>
      <MarkdownField
        label="Question"
        value={value.question}
        onChange={(question) => onChange({ question })}
        placeholder="The question coders see (markdown; values like $var.name.label work)"
      />
      <span className="text-[11px] text-muted-foreground">
        A short question of one paragraph is shown as a heading; with markdown (headings, lists, paragraphs) it is shown
        as you write it.
      </span>
    </div>
  );
}
