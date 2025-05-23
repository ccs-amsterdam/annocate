import { SwipeEventData } from "react-swipeable";
import { Code, CodebookVariable, SwipeRefs, Swipes, Transition } from "@/app/types";
import { z } from "zod";
import { get } from "http";

const swipeControl = (
  question: CodebookVariable,
  refs: SwipeRefs,
  onSwipe: (transition: Transition) => void,
  alwaysDoVertical: boolean,
  triggerdist: number = 110,
) => {
  if (!question) return {};
  if (question.type !== "annotinder") return {};

  let swipeOptions = getSwipeOptions(question.codes);

  const transitionTime = 250;
  let scrolloffset = 0;
  // const blockSwipe = useRef()

  const swipeConfig = {
    delta: 10, // min distance(px) before a swipe starts. *See Notes*
    preventDefaultTouchmoveEvent: false, // call e.preventDefault *See Details*
    trackTouch: true, // track touch input
    trackMouse: false, // track mouse input
    rotationAngle: 0, // set a rotation angle
  };

  let container: Element;
  const getDeltas = (d: SwipeEventData) => {
    if (!refs.text.current) return [0, 0];
    if (!container) container = refs.text.current.getElementsByClassName("BodyContainer")[0];
    let deltaX = d.deltaX;
    let deltaY = d.deltaY;
    if (Math.abs(deltaX) > Math.abs(deltaY) + 10) deltaY = 0;
    if (Math.abs(deltaX) < Math.abs(deltaY) + 10) deltaX = 0;
    if (!alwaysDoVertical) {
      // the bottom menu always allows vertical upward swipe, but for the
      // text div we only allow swiping up if scrolled all the way to bottom

      if (d.first) scrolloffset = container.scrollHeight - container.scrollTop - container.clientHeight;
      deltaY += scrolloffset;
    }
    return [deltaX, Math.min(0, deltaY)];
  };

  return {
    onSwiping: (d: SwipeEventData) => {
      if (!swipeOptions || !refs?.text?.current || !refs.box.current || !refs.code.current) return;

      const [deltaX, deltaY] = getDeltas(d);
      if (deltaX > 0 && !swipeOptions.right) return;
      if (deltaX < 0 && !swipeOptions.left) return;
      if (deltaY < 0 && !swipeOptions.up) return;
      //if (deltaY !== 0 && deltaY > 0) return;

      refs.text.current.style.transition = ``;
      refs.text.current.style.transform = `translateX(${deltaX}px) translateY(${deltaY}px)`;

      let bgc = swipeOptions.up?.color;
      let code = swipeOptions.up?.code;
      let [bottom, talign] = ["0%", "center"];
      if (deltaX > 0) {
        bgc = swipeOptions.right?.color;
        code = swipeOptions.right?.code;
        [bottom, talign] = ["40%", "left"];
      }
      if (deltaX < 0) {
        bgc = swipeOptions.left?.color;
        code = swipeOptions.left?.code;
        [bottom, talign] = ["40%", "right"];
      }

      refs.box.current.style.backgroundColor = String(bgc);
      refs.code.current.innerText = code;
      refs.code.current.style.bottom = bottom;
      refs.code.current.style.textAlign = talign;
    },
    onSwiped: (d: SwipeEventData) => {
      if (!swipeOptions || !refs?.text?.current || !refs.box.current || !refs.code.current) return;
      const [deltaX, deltaY] = getDeltas(d);
      if (deltaX > 0 && !swipeOptions.right) return;
      if (deltaX < 0 && !swipeOptions.left) return;
      if (deltaY < 0 && !swipeOptions.up) return;
      //if (deltaY !== 0 && deltaY > 0) return;

      refs.text.current.style.transition = `transform ${transitionTime}ms`;

      if (Math.abs(deltaX) < triggerdist && Math.abs(deltaY) < triggerdist) {
        refs.text.current.style.transform = `translateX(0%) translateY(0%)`;
      } else {
        refs.text.current.style.transform = `translateX(${
          deltaX > 0 ? 100 : deltaX < 0 ? -100 : 0
        }%) translateY(${deltaY > 0 ? 100 : -100}%)`;
        refs.box.current.style.transition = `opacity ${transitionTime}ms`;
        refs.box.current.style.opacity = "0";

        let dir: Swipes = deltaX > 0 ? "right" : "up";
        dir = deltaX < 0 ? "left" : dir;

        const code = swipeOptions[dir];
        const transition: Transition = {
          direction: dir,
          code,
        };
        onSwipe(transition);
      }
    },
    ...swipeConfig,
  };
};

export function getSwipeOptions(codes: Code[]) {
  return {
    left: codes[0],
    right: codes[1],
    up: codes[2],
  };
}

export default swipeControl;
