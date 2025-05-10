import { useEffect, useRef, useState } from "react";
import useWatchChange from "@/hooks/useWatchChange";
import { Button } from "../ui/button";
import { Check, List, StepBack, StepForward } from "lucide-react";
import { useJobContext } from "../AnnotatorProvider/AnnotatorProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { AnnotationLibrary, ProgressState } from "@/app/types";
import AnnotationManager from "@/classes/AnnotationManager";

interface NavigationProps {}

const Navigation = ({}: NavigationProps) => {
  return (
    <div className="flex h-full w-full select-none items-center">
      <NavigationDropdown />
      <NavigationButtons />
      <UnitSlider />
    </div>
  );
};

const NavigationDropdown = () => {
  const { annotationManager, progress } = useJobContext();
  const phase = progress.phases[progress.currentPhase];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={"flex items-center gap-2 px-3"}>
        <List />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={16}
        className="rounded-l-none rounded-t-none border-l-0 border-t-0"
      >
        {progress.phases.map((phase, phaseIndex) => {
          const maxVariableIndex = phase.variables.findIndex((v) => !v.done);
          return phase.variables.map((variable, variableIndex) => {
            if (variable.skip) return null;
            if (variableIndex > maxVariableIndex) return null;
            return (
              <DropdownMenuItem
                key={phaseIndex + "." + variableIndex}
                onClick={() => {
                  annotationManager.navigate(phaseIndex, phase.currentUnit, variableIndex);
                }}
              >
                {variable.label}
              </DropdownMenuItem>
            );
          });
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const NavigationButtons = () => {
  const { progress, finished, annotationLib, annotationManager } = useJobContext();
  const phase = progress.phases[progress.currentPhase];
  let hasPrevPhase = progress.currentPhase === 0;
  let hasNextPhase = progress.currentPhase === progress.phases.length - 1;

  // unit navigation
  const noPrevUnit = phase.currentUnit === 0;
  const noNextUnit = phase.currentUnit === phase.unitsDone.length - 1;

  // variable navigation
  const { setPrevVariable, setNextVariable } = variableNavigation(progress, annotationManager);

  const canGoBack = progress.settings.canGoBack && (!hasPrevPhase || !noPrevUnit);
  const canGoForward = progress.settings.canSkip && (!hasNextPhase || !noNextUnit);

  const previous = () => {
    if (!canGoBack) return;
    if (finished) {
      annotationManager.navigate(progress.phases.length - 1);
    } else if (setPrevVariable !== null) {
      setPrevVariable();
    } else if (noPrevUnit) {
      annotationManager.navigate(progress.currentPhase - 1);
    } else {
      annotationManager.navigate(progress.currentPhase, phase.currentUnit - 1);
    }
  };

  const next = () => {
    if (!canGoForward) return;
    if (setNextVariable !== null) {
      setNextVariable();
    } else if (noNextUnit) {
      annotationManager.navigate(progress.currentPhase + 1);
    } else {
      annotationManager.navigate(progress.currentPhase, phase.currentUnit + 1);
    }
  };

  return (
    <div className="flex items-center">
      {progress.settings.canGoBack || progress.settings.canSkip ? (
        <Button
          size="icon"
          variant="ghost"
          className="hover:bg-transparent"
          onClick={() => previous()}
          disabled={!canGoBack}
        >
          <StepBack className="" />
        </Button>
      ) : null}
      {progress.settings.canSkip || progress.settings.canGoBack ? (
        <Button
          variant="ghost"
          size="icon"
          className="mx-0 hover:bg-transparent"
          onClick={() => next()}
          disabled={!canGoForward}
        >
          <StepForward />
        </Button>
      ) : null}
    </div>
  );
};

function variableNavigation(progress: ProgressState, annotationManager: AnnotationManager) {
  const phase = progress.phases[progress.currentPhase];
  const variableIndex = phase.currentVariable;
  const variableStatuses = phase.variables;

  let prevVariable: number | null = null;
  let nextVariable: number | null = null;
  for (let i = 0; i < variableStatuses.length; i++) {
    const status = variableStatuses[i];
    if (status.skip) continue;
    if (i < variableIndex) prevVariable = i;
    if (i > variableIndex) nextVariable = i;
    if (nextVariable !== null) break;
  }

  const setPrevVariable = prevVariable !== null ? () => annotationManager.setVariableIndex(prevVariable || 0) : null;
  const setNextVariable = nextVariable !== null ? () => annotationManager.setVariableIndex(nextVariable || 0) : null;
  return { setPrevVariable, setNextVariable };
}

const UnitSlider = () => {
  const { progress, finished, annotationManager } = useJobContext();
  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);
  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);
  const sliderInput = useRef<HTMLInputElement>(null);

  const uProgress = progress.phases[progress.currentPhase];
  const currentUnit = uProgress.currentUnit;
  const n = uProgress.unitsDone.length;
  const maxUnit = uProgress.unitsDone.findIndex((u) => !u) || n + 1;

  useEffect(() => {
    const slider = sliderInput.current;
    if (!slider) return;
    const thumbWidth = 100 / n;
    const progress = (100 * Math.max(0, sliderPage)) / n;
    slider.style.setProperty("--thumb-width", thumbWidth + "%");
    slider.style.setProperty("--progress", progress + "%");
  }, [n, sliderPage]);

  if (useWatchChange([finished])) {
    if (finished) {
      setActivePage(n + 1);
      setSliderPage(n + 1);
    }
  }

  if (useWatchChange([currentUnit, n])) {
    if (uProgress.currentUnit === null || uProgress.currentUnit < 0) return;
    const page = uProgress.currentUnit === null ? n + 1 : Math.min(uProgress.currentUnit + 1, n + 1);
    setActivePage(page);
    setSliderPage(page);
  }

  const updatePage = (page: number) => {
    if (page !== activePage) {
      annotationManager.navigate(progress.currentPhase, page - 1);
      setActivePage(page);
      setSliderPage(page);
    }
  };

  const updateSliderPage = (e: any) => {
    // Changing the range slider directly only updates sliderPage, which shows the value on the slider.
    // the onMouseUp event then process the change
    let newpage: number | null = null;
    if (Number(e.target.value) > sliderPage) {
      if (progress.settings.canSkip) {
        newpage = Number(e.target.value);
      } else {
        newpage = Math.min(maxUnit, Number(e.target.value));
      }
    }
    if (progress.settings.canGoBack && Number(e.target.value) < sliderPage) newpage = Number(e.target.value);

    if (newpage !== null) {
      setSliderPage(newpage);
      slider.current = newpage;
    }
  };

  function counter() {
    if (sliderPage > n)
      return (
        <div>
          <Check />
        </div>
      );

    return sliderPage;
  }
  function dummyCounter() {
    // get max width for the counter
    return new Array(String(n).length).fill(0).join("");
  }

  if (n <= 1) return <div />;
  // let uProgressPct = (100 * Math.max(0, uProgress.nCoded)) / n;
  let uProgressPct = (100 * Math.max(0, sliderPage)) / n;

  return (
    <div ref={sliderInput} className="flex items-center gap-3">
      <input
        className={`unit-slider mb-[5px] h-full min-w-1 max-w-36 flex-auto rounded`}
        data-thumb-width={Math.min(10, 100 / n)}
        min={1}
        max={n}
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
      <div className="grid grid-rows-[1fr,0px] overflow-hidden text-center">
        <div>{counter()}</div>
        <div>{dummyCounter()}</div>
      </div>
    </div>
  );
};

export default Navigation;
