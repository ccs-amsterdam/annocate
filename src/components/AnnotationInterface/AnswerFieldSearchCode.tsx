import React, { useState, useEffect, useRef } from "react";
import { OnSelectParams, AnswerOption, Code } from "@/app/types";
import { Button } from "@/components/ui/button";

interface SearchCodeProps {
  /** The options the user can choose from */
  options: Code[];
  /** An array of answer values. If multiple is false, should have length 1 */
  values: (string | number)[];
  /** If true, multiple options can be chosen */
  multiple: boolean;
  /** The function used to update the values */
  onSelect: (params: OnSelectParams) => void;
  /** Like onSelect, but for finishing the question/unit with the current values */
  onFinish: () => void;
  /** If true, all eventlisteners are stopped */
  blockEvents: boolean;
}

const SearchCode = ({ options, values, multiple, onSelect, onFinish, blockEvents = false }: SearchCodeProps) => {
  const ref = useRef<HTMLInputElement>(undefined);
  const changed = useRef(false);
  const [focuson, setFocuson] = useState("dropdown");

  useEffect(() => {
    setFocuson("dropdown");
  }, [onSelect]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.keyCode === 9) {
        // tab key
        e.preventDefault();
        e.stopPropagation();
        setFocuson((focuson) => {
          if (focuson === "button") {
            ref?.current?.click();
            return "dropdown";
          }
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          return "button";
        });
      }
      if ((e.keyCode === 32 || e.keyCode === 13) && focuson === "button") {
        onSelect({ value: values, finish: true });
      }
    };

    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [focuson, setFocuson, onSelect, values]);

  changed.current = false;
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: "1 1 auto", minHeight: "185px", padding: "10px" }}></div>
      {multiple ? (
        <div style={{ minWidth: "100px", height: "100%" }}>
          <Button
            style={{
              height: "100%",
              border: `5px solid ${focuson === "button" ? "black" : "rgb(211, 223, 233)"}`,
            }}
            onClick={() => {
              onFinish();
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(SearchCode);
