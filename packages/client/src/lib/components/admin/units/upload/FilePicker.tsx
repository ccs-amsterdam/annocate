import { useRef, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A drop zone with a button: the browser's file input stays hidden. */
export function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
        over ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <FileUp className="h-6 w-6 text-muted-foreground" />
      <Button onClick={() => input.current?.click()}>Choose a CSV file</Button>
      <span className="text-xs text-muted-foreground">or drop it here</span>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
