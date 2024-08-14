import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function SimplePopover({
  trigger,
  children,
  open,
  setOpen,
  header,
  className,
}: {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  header?: string;
  className?: string;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger ? (
        <PopoverTrigger asChild className="flex">
          {trigger}
        </PopoverTrigger>
      ) : null}
      <PopoverContent className={className}>
        <div className="mb-3">{header ? <h3>{header}</h3> : null}</div>

        {children}
      </PopoverContent>
    </Popover>
  );
}
