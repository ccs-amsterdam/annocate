import useSpeedBump from "@/hooks/useSpeedBump";
import React, { useEffect, useMemo } from "react";
import { SwipeOptions, Swipes, AnswerItem, AnswerOption, Code, Annotation } from "@/app/types";
import { FaArrowLeft, FaArrowRight, FaArrowUp } from "react-icons/fa";
import { Button } from "../ui/button";
import { getSwipeOptions } from "@/functions/swipeControl";
import { OnSelectParams } from "./AnswerField";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";

const arrowKeys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];

interface AnnotinderProps {
  value: string | undefined;
  /** The options the user can choose from */
  codes: Code[];
  /** The function used to update the values */
  onSelect: (params: OnSelectParams) => void;
  /** If true, all eventlisteners are stopped */
  blockEvents: boolean;
  speedbump: boolean;
}

const Annotinder = ({ value, codes, onSelect, blockEvents, speedbump }: AnnotinderProps) => {
  const swipeOptions = useMemo(() => getSwipeOptions(codes), [codes]);

  // useEffect(() => {
  //   if (swipe) {
  //     const option = swipeOptions[swipe];
  //     onSelect({
  //       value: option.code,
  //       finish: true,
  //       transition: { direction: swipe, color: option.color },
  //     });
  //   }
  // }, [swipe, onSelect, swipeOptions]);

  const onKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      if (speedbump) return;
      // any arrowkey
      if (arrowKeys.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        let dir: "left" | "right" | "up" = "up";
        if (event.key === "ArrowRight") dir = "right";
        if (event.key === "ArrowLeft") dir = "left";
        const option = swipeOptions[dir];
        onSelect({
          code: option,
          finish: true,
        });
      }
    },

    [onSelect, swipeOptions, speedbump],
  );

  useEffect(() => {
    if (!blockEvents) {
      window.addEventListener("keydown", onKeydown);
    } else window.removeEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [onKeydown, blockEvents]);

  type Direction = "left" | "up" | "right";
  const directions: Direction[] = ["left", "up", "right"];

  return (
    <div className="flex items-center justify-center gap-2 px-2 py-1">
      {directions.map((direction: Direction, i: number) => {
        return (
          <AnnotinderStyledButton
            key={direction}
            swipeOptions={swipeOptions}
            direction={direction}
            value={value}
            onSelect={onSelect}
            speedbump={speedbump}
          />
        );
      })}
    </div>
  );
};

interface AnnotinderStyledButtonProps {
  swipeOptions: SwipeOptions;
  direction: "left" | "right" | "up";
  value: string | undefined;
  onSelect: (params: OnSelectParams) => void;
  speedbump: boolean;
}

const AnnotinderStyledButton = ({
  swipeOptions,
  direction,
  value,
  onSelect,
  speedbump,
}: AnnotinderStyledButtonProps) => {
  let icon = <FaArrowLeft />;
  let option = swipeOptions.left;
  if (direction === "up") {
    icon = <FaArrowUp />;
    option = swipeOptions.up;
  }
  if (direction === "right") {
    icon = <FaArrowRight />;
    option = swipeOptions.right;
  }
  if (!option) return null;
  const current = option?.code === value;

  function renderArrow() {
    if (direction === "up") return <ArrowUp />;
    if (direction === "left") return <ArrowLeft />;
    if (direction === "right") return <ArrowRight />;
  }

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <Button
        variant="outline"
        className={`flex h-max w-full flex-col gap-[2px] whitespace-normal border-0 pb-[2px] pt-[2px] ${current ? "ring-2 ring-primary ring-offset-2" : ""}`}
        key={option.code}
        style={{ background: option.color }}
        disabled={!option || speedbump}
        onClick={(e) => {
          onSelect({
            code: option,
            finish: true,
          });
        }}
      >
        <div>{renderArrow()}</div>
        {option.code}
      </Button>
    </div>
  );
};

export default React.memo(Annotinder);
