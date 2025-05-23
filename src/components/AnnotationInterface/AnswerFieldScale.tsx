import React, { useState, useEffect, useRef, RefObject, useMemo } from "react";
import {
  AnswerOption,
  AnswerItem,
  QuestionItem,
  Code,
  VariableItem,
  Annotation,
  QuestionAnnotation,
} from "@/app/types";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa";
import styled from "styled-components";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { OnSelectParams } from "./AnswerField";

const arrowKeys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];

interface ScaleProps {
  items: VariableItem[];
  annotations: QuestionAnnotation[];
  options: Code[];
  onSelect: (params: OnSelectParams) => void;
  onFinish: () => void;
  blockEvents: boolean;
  questionIndex: number;
}

const Scale = ({ items, annotations, options, onSelect, onFinish, blockEvents, questionIndex }: ScaleProps) => {
  // render buttons for options (an array of objects with keys 'label' and 'color')
  // On selection perform onSelect function with the button label as input
  // if canDelete is TRUE, also contains a delete button, which passes null to onSelect
  const [selectedItem, setSelectedItem] = useState<number>(0);
  const [selectedButton, setSelectedButton] = useState<number>();
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  function countAnswered() {
    if (items.length === 1) return annotations.length ? 1 : 0;
    return items.filter((item) => {
      return annotations.some((a) => a.item === item.name);
    }).length;
  }
  const nAnswered = countAnswered();
  const done = items.length === 0 ? nAnswered > 0 : nAnswered >= items.length;

  const itemRefs = useMemo(() => {
    return options.map(() => React.createRef<HTMLDivElement>());
  }, [options]);

  const onKeydown = React.useCallback(
    (event: KeyboardEvent) => {
      const nbuttons = options.length;
      const nitems = items.length || 1;
      if (selectedButton === undefined) {
        setSelectedButton(0);
        return null;
      }

      // any arrowkey
      if (arrowKeys.includes(event.key)) {
        event.preventDefault();
        if (event.key === "ArrowRight") {
          if (selectedButton < nbuttons - 1) setSelectedButton(selectedButton + 1);
        }
        if (event.key === "ArrowLeft") {
          if (selectedButton > 0) setSelectedButton(selectedButton - 1);
        }

        let newitem = null;
        if (event.key === "ArrowUp") {
          if (selectedItem > 0) newitem = selectedItem - 1;
          if (selectedItem < 0) newitem = nitems - 1;
        }
        if (event.key === "ArrowDown") {
          if (selectedItem >= 0) {
            if (selectedItem < nitems - 1) newitem = selectedItem + 1;
            if (selectedItem === nitems - 1) newitem = -1;
          }
        }

        if (newitem !== null) {
          itemRefs?.[newitem]?.current?.scrollIntoView();
          setSelectedItem(newitem);
        }
        return;
      }

      // space or enter
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (selectedItem === -1) {
          if (done) onFinish();
        } else {
          onSelect({
            code: options[selectedButton],
            finish: false,
            item: items[selectedItem]?.name,
          });
          setSelectedItem(selectedItem === nitems - 1 ? -1 : selectedItem + 1);
        }
      }
    },
    [done, selectedButton, selectedItem, onSelect, onFinish, options, items, itemRefs],
  );

  useEffect(() => {
    setSelectedButton(undefined);
    setSelectedItem(0);
  }, [questionIndex, setSelectedButton, setSelectedItem]);

  useEffect(() => {
    if (!blockEvents) {
      window.addEventListener("keydown", onKeydown);
    } else window.removeEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [onKeydown, blockEvents]);

  const left = options[0];
  const right = options[options.length - 1];

  return (
    <div className="relative flex h-full flex-col justify-between">
      <div className="flex flex-auto items-start justify-between p-2 pb-0 text-sm">
        <div className="flex max-w-[40%] items-center gap-2">{left.code}</div>

        <div className="flex max-w-[40%] items-center gap-2 text-right">{right.code}</div>
      </div>

      <Items
        annotations={annotations}
        selectedItem={selectedItem}
        items={items}
        itemRefs={itemRefs}
        options={options}
        selectedButton={selectedButton}
        onSelect={onSelect}
        continueButtonRef={continueButtonRef}
      />

      <Button
        ref={continueButtonRef}
        className={`m-1 ${selectedItem === -1 ? "ring-4 ring-secondary" : ""}`}
        disabled={!done}
        onClick={() => {
          onFinish();
        }}
      >
        {done ? <Play /> : `${nAnswered} / ${items.length}`}
      </Button>
    </div>
  );
};

interface ItemsProps {
  annotations: QuestionAnnotation[];
  selectedItem: number;
  items: VariableItem[];
  itemRefs: RefObject<HTMLDivElement | null>[];
  options: Code[];
  selectedButton?: number;
  onSelect: (params: OnSelectParams) => void;
  continueButtonRef: RefObject<HTMLButtonElement | null>;
}

const Items = ({
  annotations,
  selectedItem,
  items,
  itemRefs,
  options,
  selectedButton,
  onSelect,
  continueButtonRef,
}: ItemsProps) => {
  useEffect(() => {
    if (selectedItem < 0) continueButtonRef?.current?.scrollIntoView();
  }, [selectedItem, items, continueButtonRef]);

  const optionalItems = items.length > 0 ? items : [undefined];

  return (
    <div className="relative flex flex-auto flex-col">
      {optionalItems.map((itemObj, itemIndex: number) => {
        return (
          <Item
            key={itemIndex}
            itemObj={itemObj}
            itemRef={itemRefs[itemIndex]}
            annotations={annotations}
            selectedItem={selectedItem}
            itemIndex={itemIndex}
            options={options}
            selectedButton={selectedButton}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
};

interface ItemProps {
  itemObj: QuestionItem | undefined;
  itemRef: RefObject<HTMLDivElement | null>;
  annotations: QuestionAnnotation[];
  selectedItem: number;
  itemIndex: number;
  options: Code[];
  selectedButton?: number;
  onSelect: (params: OnSelectParams) => void;
}

const Item = ({
  itemObj,
  itemRef,
  annotations,
  selectedItem,
  itemIndex,
  options,
  selectedButton,
  onSelect,
}: ItemProps) => {
  const colorstep = 90 / options.length;
  const itemlabel = itemObj ? itemObj.label || itemObj.name?.replaceAll("_", " ") : "";
  //const background = itemIndex % 2 !== 0 ? "#6666660b" : "#6666661b";
  const padding = "0px 0px 10px 0px";

  return (
    <div key={itemIndex} style={{ padding, borderRadius: "5px" }}>
      <div>
        <div className="flex justify-center text-center">
          <div className="rounded p-1 text-sm text-foreground">{itemlabel}</div>
        </div>
      </div>
      <div className="m-auto flex max-w-[min(500px,100%)] scroll-m-24 gap-2 p-1 pb-1" ref={itemRef}>
        {options.map((option, buttonIndex: number) => {
          const current = itemObj ? annotations.find((a) => a.item === itemObj.name) : annotations[0];
          const isCurrent = current ? current.code === option.code : false;
          const isSelected = buttonIndex === selectedButton && itemIndex === selectedItem;

          // if option doesn't have color, we use primary color as background and
          // use opacity of buttoncolor to show a gradient

          let color = option.color;
          if (!color) {
            const opacity = buttonIndex * colorstep;
            color = `rgb(0,0,0, ${opacity}%)`;
          }

          return (
            <div
              className={`h-5 max-w-[50%] flex-auto rounded`}
              style={{ background: option.color ? "white" : "hsl(var(--primary))" }}
              key={option.code}
              color={color}
            >
              <button
                style={{
                  background: isCurrent ? "hsl(var(--secondary))" : option.color,
                  color: option.color || isCurrent ? "black" : "white",
                }}
                className={`${isSelected ? "ring-4 ring-secondary ring-offset-1" : ""} relative z-10 h-full w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded border-transparent px-1 text-sm font-bold`}
                // ref={option.ref as React.RefObject<HTMLButtonElement>}
                onClick={() => {
                  onSelect({ code: options[buttonIndex], finish: false, item: itemObj ? itemObj.name : undefined });
                }}
              >
                {/* {isCurrent ? getLongLabel(option) : getShortLabel(option) || option.value || buttonIndex + 1} */}
                {isCurrent ? option.code : option.value || buttonIndex + 1}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(Scale);
