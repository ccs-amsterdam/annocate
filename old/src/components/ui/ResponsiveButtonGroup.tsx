import { Ham, Menu } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface Props {
  children: React.ReactNode[] | React.ReactNode;
}

export default function ResponsiveButtonGroup({ children }: Props) {
  return (
    <div className="h-full">
      <div className="hidden gap-3 md:flex">{children}</div>
      <div className=" md:hidden">
        <Popover>
          <PopoverTrigger>
            <Menu className="h-8 w-8" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={10} className="w-min bg-primary text-primary-foreground">
            <div className="flex flex-col gap-3">{children}</div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
