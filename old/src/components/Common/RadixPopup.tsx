import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { AiOutlineClose } from "react-icons/ai";
import { cn } from "@/functions/utils";

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  className?: string;
  closeButton?: boolean;
  arrow?: boolean;
}

const RadixPopup = ({ children, trigger, className, closeButton, arrow }: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button className="IconButton" aria-label="Update dimensions">
        {trigger}
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className={cn(
          "animate-slideInRight border-shadow shadow-shadow relative m-5 rounded border-[1px] bg-background p-8 text-sm shadow-md",
          className,
        )}
        sideOffset={5}
      >
        {children}
        {closeButton ? (
          <Popover.Close
            className="hover:bg-primary-light absolute right-0 top-2 rounded-full p-2 text-xl text-primary-foreground"
            aria-label="Close"
          >
            <AiOutlineClose />
          </Popover.Close>
        ) : null}
        {arrow ? <Popover.Arrow className="PopoverArrow fill-background" /> : null}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default RadixPopup;
