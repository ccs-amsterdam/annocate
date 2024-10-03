import { useEffect, useRef, useState } from "react";
import { FaCheck, FaStepBackward, FaStepForward } from "react-icons/fa";
import styled from "styled-components";
import useWatchChange from "@/hooks/useWatchChange";
import { SetState } from "@/app/types";
import { Button } from "../ui/button";
import { Check, Forward, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import QuestionIndexStep from "./QuestionIndexStep";
import { k } from "next-usequerystate/dist/serializer-C_l8WgvO";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/dropdown-menu";

interface IndexControllerProps {}

const IndexController = ({}: IndexControllerProps) => {
  const { selectUnit, progress, finished } = useUnit();

  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);

  // unit index
  const n = progress.nTotal;
  const index = progress.currentUnit;

  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);

  if (useWatchChange([finished])) {
    if (finished) {
      setActivePage(progress.nTotal + 1);
      setSliderPage(progress.nTotal + 1);
    }
  }

  if (useWatchChange([progress.currentUnit, n])) {
    if (progress.currentUnit === null || progress.currentUnit < 0) return;
    const page = progress.currentUnit === null ? progress.nTotal + 1 : Math.min(progress.currentUnit + 1, n + 1);
    setActivePage(page);
    setSliderPage(page);
  }

  const updatePage = (page: number) => {
    if (page !== activePage) {
      selectUnit(page - 1);
      setActivePage(page);
      setSliderPage(page);
    }
  };

  const updateSliderPage = (e: any) => {
    // Changing the range slider directly only updates sliderPage, which shows the value on the slider.
    // the onMouseUp event then process the change
    let newpage: number | null = null;
    if (Number(e.target.value) > sliderPage) {
      if (progress.seekForwards) {
        newpage = Number(e.target.value);
      } else {
        newpage = Math.min(progress.nCoded + 1, Number(e.target.value));
      }
    }
    if (progress.seekBackwards && Number(e.target.value) < sliderPage) newpage = Number(e.target.value);

    if (newpage !== null) {
      setSliderPage(newpage);
      slider.current = newpage;
    }
  };

  function counter() {
    const actualPage = progress.currentUnit + 1;
    if (sliderPage > n)
      return (
        <div>
          <Check />
        </div>
      );

    let index = progress.currentUnit + 1;

    return (
      <div className="grid  text-center font-semibold">
        <div>{sliderPage}</div>
      </div>
    );
  }

  if (!n) return <div />;
  let progressPct = (100 * Math.max(0, progress.nCoded)) / n;
  if (progress.seekForwards) progressPct = 0; // linear progress is useless in this case.

  return (
    <div className="relative flex max-w-[300px] select-none items-center bg-transparent">
      <div className="mr-1 flex items-center">
        {progress.seekBackwards || progress.seekForwards ? (
          <Button
            size="icon"
            variant="ghost"
            className="hover:bg-transparent "
            onClick={() => {
              updatePage(Math.max(1, activePage - 1));
            }}
            disabled={!progress.seekBackwards || activePage === 1}
          >
            <StepBack />
          </Button>
        ) : null}
        <div className="mx-auto min-w-6">{counter()}</div>
        {progress.seekForwards || progress.seekBackwards ? (
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-transparent"
            onClick={() => {
              if (progress.seekForwards) {
                updatePage(activePage + 1);
              } else {
                updatePage(Math.min(progress.nCoded + 1, activePage + 1));
              }
            }}
            disabled={!progress.seekForwards && activePage >= progress.nCoded + 1}
          >
            <StepForward />
          </Button>
        ) : null}
      </div>
      <input
        className={`mb-[2px] min-w-1 flex-auto rounded`}
        style={{
          fill: "black",
          background: `
         linear-gradient(
         to right,
          hsl(var(--secondary)) ${progressPct}%,
          hsl(var(--primary-light)) ${progressPct}% 100%,
          hsl(var(--primary-light)) 100%
          `,
        }}
        min={1}
        max={n + 1}
        onChange={updateSliderPage}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => {
          e.stopPropagation();
          updatePage(slider.current);
        }}
        onTouchEnd={(e) => {
          // For touch events onChange runs after onTouchEnd, so we use setTimeout
          // to put it on the callback Queue. We also need a ref for sliderPage otherwise
          // it sets the previous state
          setTimeout(() => updatePage(slider.current), 0);
        }}
        type="range"
        value={sliderPage}
      />
    </div>
  );
};

function getPreviousIndex(questionIndex: number, canSelect: boolean[]) {
  for (let i = questionIndex - 1; i >= 0; i--) {
    if (!canSelect?.[i]) continue;
    return i;
  }
  return null;
}
function getNextIndex(questionIndex: number, canSelect: boolean[]) {
  for (let i = questionIndex + 1; i < canSelect.length; i++) {
    if (!canSelect?.[i]) continue;
    return i;
  }
  return null;
}
function subIndex(quesionIndex: number, canSelect: boolean[]) {
  // this is different from the actual question index, because it's the index of the selectable questions
  let question = 0;
  let total = 0;
  for (let i = 0; i < canSelect.length; i++) {
    if (canSelect[i]) {
      total++;
      if (i < quesionIndex) question++;
    }
  }
  if (total <= 1) return null;
  return question + 1;
}

export default IndexController;
