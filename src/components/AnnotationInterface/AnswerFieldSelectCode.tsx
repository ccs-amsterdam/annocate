import React, { useState, useEffect, useRef, useMemo } from "react";
import { moveUp, moveDown } from "@/functions/refNavigation";
import { Annotation, AnswerOption, Code } from "@/app/types";
import useSpeedBump from "@/hooks/useSpeedBump";
import { Button } from "@/components/ui/button";
import { OnSelectParams } from "./AnswerField";
import { Play } from "lucide-react";

const arrowKeys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];

interface SelectCodeProps {
  /** The options the user can choose from */
  options: Code[];
  annotations: Annotation[];
  /** If true, multiple options can be chosen */
  multiple: boolean;
  /** If true, all buttons are put in a single column */
  vertical: boolean;
  /** The function used to update the values */
  onSelect: (params: OnSelectParams) => void;
  /** Like onSelect, but for finishing the question/unit with the current values */
  onFinish: () => void;
  /** If true, all eventlisteners are stopped */
  blockEvents: boolean;
  /** The index of the question.  */
  questionIndex: number;
  /** speedbump */
  speedbump: boolean;
}

const SelectCode = ({
  options,
  annotations,
  multiple,
  vertical,
  onSelect,
  onFinish,
  blockEvents,
  questionIndex,
  speedbump,
}: SelectCodeProps) => {
  // render buttons for options (an array of objects with keys 'label' and 'color')
  // On selection perform onSelect function with the button label as input
  // if canDelete is TRUE, also contains a delete button, which passes null to onSelect

  const [selected, setSelected] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const finishbutton = useRef<HTMLButtonElement>(null);

  const buttonRefs = useMemo(() => {
    return options.map(() => ({ ref: React.createRef<HTMLButtonElement>() }));
  }, [options]);

  const onKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      // the finishbutton is just added to the buttons array, so that navigation still works nicely
      const buttons = multiple ? [...buttonRefs, { ref: finishbutton }] : buttonRefs;
      const nbuttons = buttons.length;

      if (selected === null || selected < 0 || selected > nbuttons) {
        setSelected(0);
        return null;
      }

      // any arrowkey
      if (arrowKeys.includes(event.key)) {
        event.preventDefault();

        if (event.key === "ArrowRight") {
          if (selected < nbuttons - 1) setSelected(selected + 1);
        }

        if (event.key === "ArrowDown") {
          setSelected(moveDown(buttons, selected));
        }

        if (event.key === "ArrowLeft") {
          if (selected > 0) setSelected(selected - 1);
        }

        if (event.key === "ArrowUp") {
          setSelected(moveUp(buttons, selected));
        }

        // buttons?.[selected]?.ref?.current?.scrollIntoView({
        //   behavior: "smooth",
        //   block: "center",
        // });
        buttons?.[selected]?.ref?.current?.scrollIntoView();
        return;
      }

      // space or enter
      if (event.keyCode === 32 || event.keyCode === 13) {
        event.preventDefault();
        event.stopPropagation();
        if (speedbump) return;

        if (selected === options.length) {
          // this would be the finish button
          onFinish();
        } else {
          if (options?.[selected])
            onSelect({
              code: options[selected],
              multiple,
              finish: !multiple,
            });
        }
      }
    },
    [selected, onSelect, multiple, options, onFinish, speedbump, buttonRefs],
  );

  useEffect(() => {
    // the first time using keyboard nav, there is not yet a selected (null)
    // if it has been used once, reset setSelected to 0 so the user always sees the cursor
    setSelected((selected) => (selected === null ? null : 0));
  }, [questionIndex, setSelected]);

  useEffect(() => {
    if (!blockEvents) {
      window.addEventListener("keydown", onKeydown);
    } else window.removeEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [onKeydown, blockEvents]);

  const mapButtons = () => {
    //vertical = true;
    let minWidth = "max(10rem, 25%)";
    if (options.length <= 3) minWidth = "33%";
    if (options.length <= 2) minWidth = "50%";
    if (options.length === 1) minWidth = "100%";
    if (vertical) minWidth = "100%";

    return options.map((option, i) => {
      const isCurrent = !!annotations.find((a) => a.code === option.code);
      const isSelected = selected === i;
      return (
        <Button
          className={`relative z-0 max-h-20 max-w-full flex-[0.3_0_auto] rounded-md p-3 text-foreground transition-transform duration-150 ease-in-out hover:scale-[1.02] 
          ${isCurrent ? " ring-2 ring-secondary ring-offset-0" : ""} 
          ${isSelected ? "scale-[1.02] bg-foreground text-background" : ""}`}
          style={{ minWidth }}
          ref={buttonRefs[i].ref}
          variant={"outline"}
          key={option.code + i}
          value={option.code}
          onClick={() => {
            if (speedbump) return;
            onSelect({
              code: option,
              multiple: multiple,
              finish: !multiple,
            }); // !multiple tells not to finish unit if multiple is true
          }}
        >
          <div className="break-word pointer-events-none relative z-20 max-h-20 whitespace-normal">{option.code}</div>
          <div
            className={`${isCurrent ? "" : ""} placeholder absolute left-0 top-0 z-10 h-full w-full rounded-md `}
            style={{ background: option.color || "hsla(var(--primary),0.6)" }}
          ></div>
        </Button>
      );
    });
  };

  const active = selected === options.length;
  return (
    <div className="flex h-full w-full flex-col px-3 py-1">
      <div
        ref={container}
        className={` flex  h-full flex-auto  flex-wrap justify-center  ${vertical ? "gap-1" : "gap-2"}`}
      >
        {mapButtons()}
      </div>
      {multiple ? (
        <div>
          <Button
            className={`mt-4 h-8 w-full  ${active ? "scale-[1.02] bg-secondary/80" : ""}`}
            variant="secondary"
            ref={finishbutton}
            onClick={() => {
              if (speedbump) return;
              onFinish();
            }}
          >
            <Play size={16} className="mr-2" />
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(SelectCode);
