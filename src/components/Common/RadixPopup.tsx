import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { AiOutlineClose } from "react-icons/ai";
import { cn } from "@/functions/utils";

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  className?: string;
}

const RadixPopup = ({ children, trigger, className, arrow }: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button className="IconButton" aria-label="Update dimensions">
        {trigger}
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className={cn(
          "shadow-shadow relative m-5 rounded bg-background p-8 text-sm shadow-lg",
          className,
        )}
        sideOffset={5}
      >
        {children}
        <Popover.Close
          className="hover:bg-primary-light text-primary-text absolute right-0 top-2 rounded-full p-2 text-xl"
          aria-label="Close"
        >
          <AiOutlineClose />
        </Popover.Close>
        <Popover.Arrow className="PopoverArrow fill-background" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default RadixPopup;
