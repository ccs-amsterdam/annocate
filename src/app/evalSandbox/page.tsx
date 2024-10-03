"use client";

import Markdown from "@/components/Common/Markdown";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { Textarea } from "@/components/ui/textarea";
import { useSandbox } from "@/hooks/useSandboxedEval";
import { useState } from "react";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";

export default function Users({ params }: { params: { projectId: number } }) {
  const [data, setData] = useState(defaultData);
  const { evalStringTemplate, ready } = useSandbox();
  const [input, setInput] = useState<string>("test this example `{{unit.topic}}` now");
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Loading />;
  return (
    <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-3">
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <Button
        onClick={() =>
          evalStringTemplate(input, defaultData)
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
      <div>
        <Markdown>{output}</Markdown>
      </div>
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
