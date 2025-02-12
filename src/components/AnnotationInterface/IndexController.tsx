import { useRef, useState } from "react";
import useWatchChange from "@/hooks/useWatchChange";
import { Button } from "../ui/button";
import { Check, ListCheck, StepBack, StepForward } from "lucide-react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";

interface IndexControllerProps {}

const IndexController = ({}: IndexControllerProps) => {
  return (
    <div className="flex h-full w-full items-center">
      <PhaseIndexController />
    </div>
  );
};

const PhaseIndexController = ({}: IndexControllerProps) => {
  const { selectUnit, progress, finished } = useUnit();
  const [activePage, setActivePage] = useState(0);

  const phase = progress.phases[progress.phase];
  const hasUnits = phase.type === "annotation";
  const n = progress.phases.length;
  const index = progress.phase;

  // const phaseMin = progress.phase === 0;
  // const phaseMax = progress.phase === progress.phases.length - 1;
  // const unitMin = !hasUnits || phase.currentUnit === 0;
  // const unitMax = !hasUnits || phase.currentUnit === phase.nTotal - 1;
  // const phaseCodedMax = progress.phase >= progress.phasesCoded;
  // const unitsCodedmax = !hasUnits || phase.currentUnit >= phase.nCoded;

  if (useWatchChange([finished])) {
    if (finished) {
      setActivePage(progress.phases.length + 1);
    }
  }

  if (useWatchChange([index, n])) {
    if (index === null || index < 0) return;
    const page = index === null ? n + 1 : Math.min(index + 1, n + 1);
    setActivePage(page);
  }

  const value = hasUnits ? `${progress.phase} - ${phase.currentUnit + 1}` : progress.phase;

  return (
    <button className="flex h-full items-center gap-2 py-1">
      {progress.phases.map((phase, i) => {
        const current = i === progress.phase;
        const todo = i > progress.phasesCoded;
        const done = i < progress.phasesCoded;

        const hasUnits = phase.type === "annotation";
        if (hasUnits && current) return <UnitIndexController />;
        return (
          <div
            key={i}
            className={`${current || finished ? "border-foreground" : ""} flex h-full min-w-9 items-center justify-center border-b px-1`}
          >
            <img
              src={"/assets/cat_progress.png"}
              className="h-8 scale-x-[-1] transform bg-transparent invert dark:invert-[0]"
              style={{ display: current ? "block" : "none" }}
              alt="Cat Loader"
            />
            <img
              src={"/assets/fish.png"}
              className="h-8 scale-x-[-1] transform bg-transparent p-2 invert dark:invert-[0]"
              style={{ display: todo ? "block" : "none" }}
              alt="Cat Loader"
            />
            <ListCheck style={{ display: done ? "block" : "none" }} />
          </div>
        );
      })}
    </button>
  );
};

const UnitIndexController = () => {
  const { selectUnit, progress, finished } = useUnit();
  const uProgress = progress.phases[progress.phase];
  if (uProgress.type !== "annotation") return null;

  const [activePage, setActivePage] = useState(0);
  const [sliderPage, setSliderPage] = useState(0);

  // unit index
  const n = uProgress.nTotal;
  const index = uProgress.currentUnit;

  // also keep track of slider as a ref, because touchevents suck (see onTouchEnd below for explanation)
  const slider = useRef(0);

  if (useWatchChange([finished])) {
    if (finished) {
      setActivePage(uProgress.nTotal + 1);
      setSliderPage(uProgress.nTotal + 1);
    }
  }

  if (useWatchChange([uProgress.currentUnit, n])) {
    if (uProgress.currentUnit === null || uProgress.currentUnit < 0) return;
    const page = uProgress.currentUnit === null ? uProgress.nTotal + 1 : Math.min(uProgress.currentUnit + 1, n + 1);
    setActivePage(page);
    setSliderPage(page);
  }

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
    <input
      className={`mb-[2px] ml-2 min-w-1 max-w-36 flex-auto rounded`}
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
  );
};

export default IndexController;
