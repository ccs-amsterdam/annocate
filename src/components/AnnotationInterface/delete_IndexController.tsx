import { useRef, useState } from "react";
import useWatchChange from "@/hooks/useWatchChange";
import { Button } from "../ui/button";
import {
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ListCheck,
  Play,
  Square,
  StepBack,
  StepForward,
} from "lucide-react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

interface IndexControllerProps {}

const IndexController = ({}: IndexControllerProps) => {
  return (
    <div className="flex h-full w-full select-none items-center gap-5">
      <Navigation global />
      <Phase />
      <UnitSlider navigation />

      {/* <div className="mx-auto flex items-center gap-3">
        <UnitSlider navigation />
        <Navigation />
      </div> */}
    </div>
  );
};

const PhaseSelector = ({}: IndexControllerProps) => {
  const { selectUnit, progress, finished } = useUnit();

  return (
    <button className="flex h-full items-center gap-1 py-1">
      {progress.phases.map((phase, i) => {
        let status: Status = "todo";
        if (i === progress.phase) status = "active";
        if (i < progress.phasesCoded || finished) status = "done";

        const hasUnits = phase.type === "annotation";

        return (
          <Button className="h-12 w-12 p-0" variant="ghost" onClick={() => selectUnit(i)}>
            <ProgressIndicator status={status} style="default" />
          </Button>
        );
      })}
    </button>
  );
};

const Phase = ({ dropdown }: { dropdown?: boolean }) => {
  const { selectUnit, progress, finished } = useUnit();
  const phase = progress.phases[progress.phase];
  const label = phase.label;
  if (!dropdown) {
    return <div className="flex items-center gap-2">{label}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={"flex items-center gap-2"}>
        {phase.label}
        <ChevronDown size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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

// any style other than default must have `${style}_active.png`,
// `${style}_done.png`, `${style}_todo.png` in the assets folder
type Style = "default" | "cat";
type Status = "active" | "done" | "todo";

function ProgressImg({ src }: { src: string }) {
  return (
    <img
      src={`/assets/${src}.png`}
      className="h-full scale-x-[-1] transform bg-transparent object-contain p-2 invert dark:invert-[0]"
      alt={src}
    />
  );
}

function ProgressIndicator({ status, style }: { status: "active" | "done" | "todo"; style: Style }) {
  if (style !== "default") return <ProgressImg src={`${style}_${status}`} />;
  switch (status) {
    case "active":
      return <Play />;
    case "done":
      return <Check />;
    case "todo":
      return <Square />;
  }
}

const Navigation = ({ global }: { global?: boolean }) => {
  const { selectUnit, progress, finished } = useUnit();
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

  const hasPrevUnit = phase.type === "survey" || phase.currentUnit === 0;
  const hasNextUnit = phase.type === "survey" || phase.currentUnit === phase.nTotal - 1;

  const canGoBack = progress.seekBackwards && (!hasPrevPhase || !hasPrevUnit);
  const canGoForward = progress.seekForwards && (!hasNextPhase || !hasNextUnit);

  const previous = () => {
    if (!canGoBack) return;
    if (finished) {
      selectUnit(progress.phases.length - 1);
    } else if (hasPrevUnit) {
      selectUnit(progress.phase - 1);
    } else {
      selectUnit(progress.phase, phase.currentUnit - 1);
    }
  };

  const next = () => {
    if (!canGoForward) return;
    if (hasNextUnit) {
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

const UnitSlider = ({ navigation }: { navigation?: boolean }) => {
  const { selectUnit, progress, finished } = useUnit();
  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);
  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);

  const uProgress = progress.phases[progress.phase];
  const hasUnits = uProgress.type === "annotation";
  const currentUnit = hasUnits ? uProgress.currentUnit : 0;
  const n = hasUnits ? uProgress.nTotal : 0;

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

    return (
      <div className="grid text-center font-semibold">
        <div>{sliderPage}</div>
      </div>
    );
  }

  if (!n) return <div />;
  let uProgressPct = (100 * Math.max(0, uProgress.nCoded)) / n;
  if (progress.seekForwards) uProgressPct = 0; // linear uProgress is useless in this case.

  return (
    <div className="flex items-center gap-6">
      <input
        className={`mb-[5px] ml-2 h-full min-w-1 max-w-36 flex-auto rounded`}
        style={{
          fill: "secondary",
          background: `
         linear-gradient(
         to right,
          hsl(var(--secondary)) ${uProgressPct}%,
          hsl(var(--primary-light)) ${uProgressPct}% 100%,
          hsl(var(--primary-light)) 100%
          `,
        }}
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
      <div>{counter()}</div>
    </div>
  );
};

export default IndexController;
