import { useRef, useState } from "react";
import { FaCheck, FaStepBackward, FaStepForward } from "react-icons/fa";
import styled from "styled-components";
import useWatchChange from "@/hooks/useWatchChange";
import { SetState } from "@/app/types";
import { Button } from "../ui/button";
import { Check, Forward, StepBack, StepForward } from "lucide-react";

interface IndexControllerProps {
  n: number;
  progressN: number;
  index: number | null;
  setIndex: (index: number) => void;
  canGoForward: boolean;
  canGoBack: boolean;
}

const IndexController = ({
  n,
  progressN,
  index,
  setIndex,
  canGoForward = true,
  canGoBack = true,
}: IndexControllerProps) => {
  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);

  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);

  if (useWatchChange([index, n])) {
    if (index === null || index < 0) return;
    const page = index === null ? n + 1 : Math.min(index + 1, n + 1);
    setActivePage(page);
    setSliderPage(page);
  }

  const updatePage = (page: number) => {
    if (page !== activePage) {
      setIndex(page - 1);
      setActivePage(page);
      setSliderPage(page);
    }
  };

  const updateSliderPage = (e: any) => {
    // Changing the range slider directly only updates sliderPage, which shows the value on the slider.
    // the onMouseUp event then process the change
    let newpage: number | null = null;
    if (Number(e.target.value) > sliderPage) {
      if (canGoForward) {
        newpage = Number(e.target.value);
      } else {
        newpage = Math.min(progressN + 1, Number(e.target.value));
      }
    }
    if (canGoBack && Number(e.target.value) < sliderPage) newpage = Number(e.target.value);

    if (newpage !== null) {
      setSliderPage(newpage);
      slider.current = newpage;
    }
  };

  if (!n) return <div />;
  let progress = (100 * Math.max(0, progressN)) / n;
  if (canGoForward) progress = 0; // linear progress is useless in this case.

  return (
    <div className="relative flex max-w-[300px] select-none items-center bg-transparent">
      <div className="mr-1 flex items-center">
        {canGoBack || canGoForward ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => updatePage(Math.max(1, activePage - 1))}
            disabled={!canGoBack || activePage === 1}
          >
            <StepBack />
          </Button>
        ) : null}
        <div className="mx-auto min-w-6">
          {sliderPage > n ? (
            <div>
              <Check />
            </div>
          ) : (
            <div className="text-center font-semibold">{sliderPage}</div>
          )}
        </div>
        {canGoForward || canGoBack ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (canGoForward) {
                updatePage(activePage + 1);
              } else {
                updatePage(Math.min(progressN + 1, activePage + 1));
              }
            }}
            disabled={!canGoForward && activePage >= progressN + 1}
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
          hsl(var(--secondary)) ${progress}%,
          hsl(var(--primary-light)) ${progress}% 100%, 
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

export default IndexController;
