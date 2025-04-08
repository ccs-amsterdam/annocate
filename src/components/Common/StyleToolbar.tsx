import { AlignCenter, AlignLeft, Bold, Edit, Italic, Underline } from "lucide-react";

import { Button } from "../ui/button";
import { CSSProperties, useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

interface Props {
  style: Record<string, string>;
  setStyle: (style: Record<string, string>) => void;
  positionBottom?: boolean;
  forMarkdown?: boolean;
}

export function StyleToolbar({ style, setStyle, positionBottom, forMarkdown }: Props) {
  const [customStyle, setCustomStyle] = useState<string>("");

  function buttonActive(key: keyof CSSProperties, value: string) {
    if (style[key] === value) return "text-foreground bg-primary/70 hover:bg-primary/80";
    return "text-foreground/80 hover:bg-primary/50";
  }

  function setOrRmStyle(key: keyof CSSProperties, value: string) {
    if (style[key] === value) {
      const { [key]: _, ...rest } = style;
      setStyle(rest);
    } else {
      setStyle({ ...style, [key]: value });
    }
  }

  function buttonProps(
    key: keyof CSSProperties,
    value: string,
    position?: "left" | "right" | "leftBottom" | "rightBottom",
  ) {
    let rounded = "";
    if (position === "left") rounded = "rounded-l";
    if (position === "right") rounded = "rounded-r";
    if (position === "leftBottom") rounded = "rounded-bl";
    if (position === "rightBottom") rounded = "rounded-br";

    return {
      className: `${buttonActive(key, value)} rounded-none ${rounded} h-6 w-8 p-2`,
      onClick: () => setOrRmStyle(key, value),
    };
  }

  function JSONToText(style: Record<string, string>) {
    // from the style object, genrate string where each lline is a key value pair
    let text = "";
    for (const key in style) {
      text += `${key}: ${style[key]}\n`;
    }
    return text;
  }
  function TextToJSON(text: string) {
    // from the text, generate a style object
    const lines = text.split("\n");
    const newStyle: Record<string, string> = {};
    for (const line of lines) {
      const [key, value] = line.split(/: +/);
      if (key == null || value == null) continue;
      newStyle[key] = value;
    }
    return newStyle;
  }

  useEffect(() => {
    setCustomStyle(JSONToText(style));
  }, [style]);

  const fontSize =
    style.fontSize !== undefined ? Math.round(Number(style.fontSize.replace(/r?em/, "") || 1) * 100) : 100;

  return (
    <div className="flex">
      <Button type="button" size="icon" variant="ghost" {...buttonProps("textAlign", "left", "leftBottom")}>
        <AlignLeft />
      </Button>
      <Button type="button" size="icon" variant="ghost" {...buttonProps("textAlign", "center")}>
        <AlignCenter />
      </Button>
      {forMarkdown ? null : (
        <>
          <Button type="button" size="icon" variant="ghost" {...buttonProps("fontWeight", "bold")}>
            <Bold />
          </Button>
          <Button type="button" size="icon" variant="ghost" {...buttonProps("fontStyle", "italic")}>
            <Italic />
          </Button>
        </>
      )}

      <div className="relative flex py-[0.05rem] text-[1rem] text-foreground/70">
        <Input
          type="number"
          className="z-10 h-6 w-[66px] border-none bg-transparent py-0 text-[1rem] text-foreground/70 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          min={10}
          max={400}
          step={10}
          value={fontSize}
          onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) / 100 + "em" })}
        />
        <div className="absolute right-3 z-0 select-none pt-[0.14rem]">%</div>
      </div>
      <Popover>
        <PopoverTrigger className="ml-auto">
          <Edit />
        </PopoverTrigger>
        <PopoverContent className="h-96 w-96 max-w-[95vw]">
          <div className="flex h-full flex-col gap-3">
            <p className="text-sm">
              Manually specify CSS properties. Names must be in camel case (e.g., fontSize, fontWeight)
            </p>
            <Textarea
              className="h-full flex-auto"
              value={customStyle}
              placeholder="fontSize: 1em"
              onChange={(e) => setCustomStyle(e.target.value)}
            />
            <Button type="button" onClick={() => setStyle(TextToJSON(customStyle))}>
              Update
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
