"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSandboxedEval } from "@/hooks/useSandboxedEval";
import { useState } from "react";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";

export default function Users({ params }: { params: { projectId: number } }) {
  const [data, setData] = useState(defaultData);
  const seval = useSandboxedEval(data);
  const [input, setInput] = useState<string>('"test"');
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-3">
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <Button
        onClick={() =>
          seval(input, z.string())
            .then((output) => {
              setOutput(output);
              setError(null);
            })
            .catch((e) => {
              console.error(e);
              if (e instanceof ZodError) {
                setError(fromZodError(e).message);
                return;
              }
              setError(e);
              setOutput("");
            })
        }
      >
        Run
      </Button>
      <div>{output}</div>
      <div className="text-red-500">{error}</div>
    </div>
  );
}

const defaultData = {
  unit: {
    topic: "economy",
  },
  survey: {
    age: 21,
  },
};
