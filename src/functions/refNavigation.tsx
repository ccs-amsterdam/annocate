import { RefObject } from "react";

interface Position {
  top: number;
  bottom: number;
  left: number;
  right: number;
  x: number;
  width: number;
  height: number;
}
interface hasHTMLRef {
  ref?: RefObject<HTMLElement | null>;
}

/**
 *
 * @param {*} arr An array of objects that each has a .ref key
 * @param {*} selected
 */
export const moveUp = (arr: hasHTMLRef[] | undefined, selected: number, xposition: number = -1) => {
  // given an array of refs for buttons (or any divs), and the current selected button,
  // move to most overlapping button on previous row
  // (basically, what you want to happen when you press 'up' in a cloud of buttons)
  if (!arr || !arr[selected]?.ref) return selected;

  const currentPos = getPosition(arr[selected].ref, arr?.[xposition]?.ref);

  let correctRow = null;
  let prevColOverlap = 0;
  for (let i = selected - 1; i >= 0; i--) {
    const el = arr[i].ref;
    if (!el) continue;

    if (arr[i].ref == null || el.current === null) return i + 1;
    const nextPos = getPosition(el);

    if (correctRow === null) {
      if (sameRow(currentPos, nextPos)) continue;
      correctRow = nextPos; // set correct row once we reach a button on the next row
    } else {
      if (!sameRow(correctRow, nextPos)) return i + 1;
    }

    const colOverlap = calcColOverlap(currentPos, nextPos);
    //if (colOverlap > 0.5) return i;
    if (prevColOverlap > 0 && colOverlap < prevColOverlap) return i + 1;
    if (currentPos.left > nextPos.right) return i;

    prevColOverlap = colOverlap;
  }

  return 0;
};

/**
 *
 * @param {*} arr An array of objects that each has a .ref key
 * @param {*} selected
 */
export const moveDown = (arr: hasHTMLRef[] | undefined, selected: number, xposition: number = -1) => {
  // like moveUp, but down
  if (!arr || !arr?.[selected]?.ref) return selected;

  const currentPos = getPosition(arr[selected].ref, arr?.[xposition]?.ref);
  let correctRow = null;
  let prevColOverlap = 0;
  for (let i = selected + 1; i < arr.length; i++) {
    const el = arr[i].ref;
    if (el == null || el.current === null) return i - 1;
    const nextPos = getPosition(el);

    if (correctRow === null) {
      if (sameRow(currentPos, nextPos)) continue;
      correctRow = nextPos; // set correct row once we reach a button on the next row
    } else {
      if (!sameRow(correctRow, nextPos)) return i - 1;
    }

    const colOverlap = calcColOverlap(currentPos, nextPos);
    //if (colOverlap > 0.5) return i;
    if (prevColOverlap > 0 && colOverlap < prevColOverlap) return i - 1;
    if (currentPos.right < nextPos.left) return i;
    prevColOverlap = colOverlap;
  }

  return arr.length - 1;
};

const sameRow = (a: Position, b: Position) => {
  // we can't just check if y positions are the same, because they fool around a bit
  // so instead we look at how much buttons overlap on the y axis

  const lowestTop = Math.max(a.top, b.top); // lowest top of two buttons on screen
  const highestBottom = Math.min(a.bottom, b.bottom); // highest bottom of two buttons on screen

  const overlap = highestBottom - lowestTop;
  // if buttons overlap more than 50% of height of box a, say they overlap
  // (really, boxes on the same row will overlap > 99%, so this is very safe)
  return overlap > 0.5 * a.height;
};

const calcColOverlap = (a: Position, b: Position): number => {
  const rightestLeft = Math.max(a.left, b.left);
  const leftestRight = Math.min(a.right, b.right);

  const pctA = (leftestRight - rightestLeft) / a.width;
  const pctB = (leftestRight - rightestLeft) / b.width;
  return Math.max(pctA, pctB);
};

const getPosition = (
  ref: RefObject<HTMLElement | null> | undefined,
  horizontalRef?: RefObject<HTMLElement | null> | undefined,
): Position => {
  if (!ref?.current) return { top: 0, bottom: 0, left: 0, right: 0, x: 0, width: 0, height: 0 };
  const pos = ref.current.getBoundingClientRect();

  if (horizontalRef?.current != null) {
    const hpos = horizontalRef.current.getBoundingClientRect();
    pos.x = hpos.x;
    pos.width = hpos.width;
  }

  const position: Position = {
    top: pos.top,
    bottom: pos.bottom,
    left: pos.left,
    right: pos.right,
    x: pos.x,
    width: pos.width,
    height: pos.height,
  };
  return position;
};
