import { useEffect, useState, useRef, RefObject } from "react";
import { OnSelectParams, AnswerItem, QuestionItem, SetState } from "@/app/types";
import { Button } from "@/components/ui/button";

interface InputsProps {
  /** The item array of the current question. Contains al settings for items */
  items: any[];
  /** An array of answer items (matching the items array in length and order)  */
  answerItems: AnswerItem[];
  /** The function used to update the values */
  onSelect: (params: OnSelectParams) => void;
  /** Like onSelect, but for finishing the question/unit with the current values */
  onFinish: () => void;
  /** If true, all eventlisteners are stopped */
  blockEvents: boolean;
  /** The index of the question.  */
  questionIndex: number;
}

/**
 * Answerfield for (multiple) open input items, like text, number
 * @returns
 */
const Inputs = ({ items, answerItems, onSelect, onFinish, blockEvents, questionIndex }: InputsProps) => {
  const [selectedItem, setSelectedItem] = useState(1);

  useEffect(() => {
    setSelectedItem(1);
  }, [questionIndex]);

  const done =
    answerItems &&
    answerItems.length > 0 &&
    !answerItems.some((a, i) => (a.values?.[0] == null || a.invalid) && !items?.[i]?.optional);
  if (!answerItems) return null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyItems: "space-between",
      }}
    >
      <Items
        answerItems={answerItems}
        done={done}
        items={items}
        onSelect={onSelect}
        onFinish={onFinish}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        blockEvents={blockEvents}
      />
      <Button
        disabled={!done}
        style={{
          padding: "1rem 1.5rem 0.9rem",
          minHeight: "30px",
          textAlign: "center",
          margin: "10px 0 0 0",
          border: `4px solid ${selectedItem === items.length ? "black" : "#00000044"}`,
        }}
        onClick={() => {
          // this is a bit of an odd one out. We didn't anticipate having multiple answers,
          // so some of the previous logic doesn't hold
          onFinish();
        }}
      >
        {done ? "Continue" : "Please complete the form to continue"}
      </Button>
    </div>
  );
};

interface ItemsProps {
  answerItems: AnswerItem[];
  done: boolean;
  items: QuestionItem[];
  onSelect: (params: OnSelectParams) => void;
  onFinish: () => void;
  selectedItem: number;
  setSelectedItem: SetState<number>;
  blockEvents: boolean;
}

const Items = ({
  answerItems,
  done,
  items,
  onSelect,
  onFinish,
  selectedItem,
  setSelectedItem,
  blockEvents,
}: ItemsProps) => {
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.keyCode === 9) {
        // tab key
        e.preventDefault();
        e.stopPropagation();

        // go to next item (including continue button) or go to first when none left
        setSelectedItem((selectedItem: number) => {
          let newselecteditem;
          if (e.shiftKey) {
            newselecteditem = selectedItem <= 0 ? items.length : selectedItem - 1;
          } else {
            newselecteditem = selectedItem >= items.length ? 0 : selectedItem + 1;
          }
          return newselecteditem;
        });
      }

      //if ((e.keyCode === 32 || e.keyCode === 13) && selectedItem === items.length) {
      if (e.keyCode === 13 && selectedItem === items.length) {
        if (done) onFinish();
        return;
      }
    };

    if (!blockEvents) {
      window.addEventListener("keydown", onKeydown);
    } else window.removeEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [blockEvents, done, items, onSelect, onFinish, answerItems, selectedItem, setSelectedItem]);

  useEffect(() => {
    function scrollActive() {
      const selectedEl = items?.[selectedItem]?.ref?.current;
      if (selectedEl) {
        selectedEl.focus();
        selectedEl.scrollIntoView();
      } else {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
    }

    // repeat with some delays, because on mobile the keyboard can pop up and mess things up
    setTimeout(scrollActive, 10);
  }, [selectedItem, items]);

  return (
    <div
      key="itemsdiv"
      style={{
        flex: "1 1 auto",
        //overflow: "auto",
        display: "flex",
        //flexDirection: "column",
        flexWrap: "wrap",
      }}
    >
      {items.map((itemObj, itemIndex: number) => {
        let itemlabel = itemObj.label ?? itemObj.name ?? itemObj;
        return (
          <div
            key={itemIndex + "_" + itemObj.label}
            style={{ padding: "10px", textAlign: "center", flex: "1 1 auto", margin: "auto" }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (done) onFinish();
              }}
            >
              <div>
                <label style={{ color: "var(--foreground-inversed-fixed)", fontSize: "0.8em" }}>
                  <>
                    {itemlabel}
                    <i style={{ color: "var(--text-light-fixed)" }}>{itemObj?.optional ? " (optional)" : ""}</i>
                  </>
                </label>
                <br />

                <Input answerItems={answerItems} onSelect={onSelect} item={itemObj} itemIndex={itemIndex} />
              </div>
            </form>
            -foreground
          </div>
        );
      })}
    </div>
  );
};

// TO DO: instead of the excessive scroll into view, we could have the input shown at the
// top of the screen. This prevents that they keyboard on mobile messes things up and the
// user can't read the input.

// const InputModal = styled.div`
//   position: fixed;
//   z-index: 9999;
//   display: flex;
//   justify-content: center;
//   top: 10rem;
//   left: 0;
//   width: 100%;
//   height: 3rem;
//   pointer-events: none;

//   .Content {
//     flex: 1 1 auto;
//     padding: 1rem;
//     background: var(--background-inversed);
//     color: var(--text-inversed);
//   }
// `;

interface InputProps {
  answerItems: AnswerItem[];
  onSelect: (params: OnSelectParams) => void;
  item: QuestionItem;
  itemIndex: number;
}

const Input = ({ answerItems, onSelect, item, itemIndex }: InputProps) => {
  item.ref = useRef(undefined);
  const value = answerItems?.[itemIndex]?.values?.[0]; // for all non-multiple forms

  function onFocus(): void {
    const el = item?.ref?.current;
    if (!el) return null;
    let times = 0;
    const interval = setInterval(() => {
      el.scrollIntoView();
      if (++times > 20) clearInterval(interval);
    }, 50);
  }

  if (item?.type === "number") {
    return (
      (<input
        key={item.name}
        ref={item.ref as RefObject<HTMLInputElement | null>}
        type={"number"}
        min={item?.min}
        max={item?.max}
        value={isNaN(Number(value)) ? "" : Number(value)}
        style={{
          maxWidth: "150px",
          textAlign: "center",
        }}
        onFocus={onFocus}
        onChange={(e) => {
          if (!answerItems?.[itemIndex]) return;
          let value = e.target.value;
          const invalid =
            isNaN(Number(value)) ||
            (item.min != null && Number(value) < item.min) ||
            (item.max != null && Number(value) > item.max);
          onSelect({ value, itemIndex, invalid });
        }}
      />)
    );
  }

  if (item?.type === "textarea") {
    return (
      (<textarea
        key={item.name}
        ref={item.ref as RefObject<HTMLTextAreaElement | null>}
        rows={item?.rows || 5}
        value={value || ""}
        onFocus={onFocus}
        onChange={(e) => {
          if (!answerItems?.[itemIndex]) return;
          const value = e.target.value === "" ? null : e.target.value;
          onSelect({ value, itemIndex });
        }}
      ></textarea>)
    );
  }

  // text input, but with validation and autocomplete
  if (item?.type === "email")
    return (
      (<input
        type="email"
        name="email"
        key={item.name}
        ref={item.ref as RefObject<HTMLInputElement | null>}
        autoComplete={"email"}
        value={value || ""}
        style={{
          maxWidth: "300px",
          textAlign: "center",
          background: answerItems[itemIndex].invalid ? "#fa1e1e4d" : "white",
        }}
        onFocus={onFocus}
        onChange={(e) => {
          if (!answerItems?.[itemIndex]) return;
          const value = e.target.value === "" ? null : e.target.value;
          const invalid = !!e.target.validationMessage;
          onSelect({ value, itemIndex, invalid });
        }}
      />)
    );

  // regular text input
  return (
    (<input
      key={item.name}
      ref={item.ref as RefObject<HTMLInputElement | null>}
      autoComplete={item?.autocomplete}
      value={value || ""}
      style={{ maxWidth: "300px", textAlign: "center" }}
      onFocus={onFocus}
      onChange={(e) => {
        if (!answerItems?.[itemIndex]) return;
        const value = e.target.value === "" ? null : e.target.value;
        onSelect({ value, itemIndex });
      }}
    />)
  );
};

export default Inputs;
