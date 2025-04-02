import { useEffect, useRef, useState } from "react";
import useWatchChange from "@/hooks/useWatchChange";
import { Button } from "../ui/button";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  List,
  ListCheck,
  Menu,
  Play,
  Square,
  StepBack,
  StepForward,
} from "lucide-react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { AnnotationLibrary, VariableStatus } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";

interface NavigationProps {}

const Navigation = ({}: NavigationProps) => {
  return (
    <div className="flex h-full w-full select-none items-center">
      <NavigationDropdown />
      <NavigationButtons global />
      <UnitSlider navigation />
    </div>
  );
};

const NavigationDropdown = () => {
  const { selectUnit, progress, finished } = useUnit();
  const phase = progress.phases[progress.phase];
  const label = phase.label;

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
        {progress.phases.map((phase, i) => {
          return (
            <DropdownMenuItem
              key={i + phase.label}
              onClick={() => {
                selectUnit(i);
              }}
            >
              {phase.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const NavigationButtons = ({ global }: { global?: boolean }) => {
  const { selectUnit, progress, finished, annotationLib, annotationManager } = useUnit();
  const phase = progress.phases[progress.phase];
  let hasPrevPhase = progress.phase === 0;
  let hasNextPhase = progress.phase === progress.phases.length - 1;

  if (!global) {
    // if not global, only show navigation for phases with units
    if (phase.type !== "annotation") return null;
    // if not global, we only allow navigation within the current phase
    hasPrevPhase = true;
    hasNextPhase = true;
  }

  // unit navigation
  const hasPrevUnit = phase.type === "survey" || phase.currentUnit === 0;
  const hasNextUnit = phase.type === "survey" || phase.currentUnit === phase.nTotal - 1;

  // variable navigation
  const { setPrevVariable, setNextVariable } = variableNavigation(annotationLib, annotationManager);

  const setQuestionIndex = (index: number) => annotationManager.setVariableIndex(index);

  const canGoBack = progress.seekBackwards && (!hasPrevPhase || !hasPrevUnit);
  const canGoForward = progress.seekForwards && (!hasNextPhase || !hasNextUnit);

  const previous = () => {
    if (!canGoBack) return;
    if (finished) {
      selectUnit(progress.phases.length - 1);
    } else if (setPrevVariable !== null) {
      setPrevVariable();
    } else if (hasPrevUnit) {
      selectUnit(progress.phase - 1);
    } else {
      selectUnit(progress.phase, phase.currentUnit - 1);
    }
  };

  const next = () => {
    if (!canGoForward) return;
    if (setNextVariable !== null) {
      setNextVariable();
    } else if (hasNextUnit) {
      selectUnit(progress.phase + 1);
    } else {
      selectUnit(progress.phase, phase.currentUnit + 1);
    }
  };

  return (
    <div className="flex items-center">
      {progress.seekBackwards || progress.seekForwards ? (
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
      {progress.seekForwards || progress.seekBackwards ? (
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

function variableNavigation(annotationLib: AnnotationLibrary, annotationManager: AnnotationManager) {
  const variableIndex = annotationLib.variableIndex;
  const variableStatuses = annotationLib.variableStatuses;

  let prevVariable: number | null = null;
  let nextVariable: number | null = null;
  for (let i = 0; i < variableStatuses.length; i++) {
    const status = variableStatuses[i];
    if (status === "skip") continue;
    if (i < variableIndex) prevVariable = i;
    if (i > variableIndex) nextVariable = i;
    if (nextVariable !== null) break;
  }

  const setPrevVariable = prevVariable !== null ? () => annotationManager.setVariableIndex(prevVariable || 0) : null;
  const setNextVariable = nextVariable !== null ? () => annotationManager.setVariableIndex(nextVariable || 0) : null;
  return { setPrevVariable, setNextVariable };
}

const UnitSlider = ({ navigation }: { navigation?: boolean }) => {
  const { selectUnit, progress, finished } = useUnit();
  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);
  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);
  const sliderInput = useRef<HTMLInputElement>(null);

  const uProgress = progress.phases[progress.phase];
  const hasUnits = uProgress.type === "annotation";
  const currentUnit = hasUnits ? uProgress.currentUnit : 0;
  const n = hasUnits ? uProgress.nTotal : 0;

  useEffect(() => {
    const slider = sliderInput.current;
    if (!slider) return;
    const thumbWidth = 100 / n;
    const progress = (100 * Math.max(0, sliderPage)) / n;
    slider.style.setProperty("--thumb-width", thumbWidth + "%");
    slider.style.setProperty("--progress", progress + "%");
  }, [n, sliderPage]);

  if (useWatchChange([finished]) && hasUnits) {
    if (finished) {
      setActivePage(uProgress.nTotal + 1);
      setSliderPage(uProgress.nTotal + 1);
    }
  }

  if (useWatchChange([currentUnit, n]) && hasUnits) {
    if (uProgress.currentUnit === null || uProgress.currentUnit < 0) return;
    const page = uProgress.currentUnit === null ? uProgress.nTotal + 1 : Math.min(uProgress.currentUnit + 1, n + 1);
    setActivePage(page);
    setSliderPage(page);
  }

  if (uProgress.type !== "annotation") return null;

  const updatePage = (page: number) => {
    if (page !== activePage) {
      selectUnit(progress.phase, page - 1);
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
        newpage = Math.min(uProgress.nCoded + 1, Number(e.target.value));
      }
    }
    if (progress.seekBackwards && Number(e.target.value) < sliderPage) newpage = Number(e.target.value);

    if (newpage !== null) {
      setSliderPage(newpage);
      slider.current = newpage;
    }
  };

  function counter() {
    if (uProgress.type !== "annotation") return null;

    const actualPage = uProgress.currentUnit + 1;
    if (sliderPage > n)
      return (
        <div>
          <Check />
        </div>
      );

    let index = uProgress.currentUnit + 1;

    return sliderPage;
  }
  function dummyCounter() {
    // get max width for the counter
    return new Array(String(n).length).fill(0).join("");
  }

  if (!n) return <div />;
  // let uProgressPct = (100 * Math.max(0, uProgress.nCoded)) / n;
  let uProgressPct = (100 * Math.max(0, sliderPage)) / n;
  console.log(uProgressPct);

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
