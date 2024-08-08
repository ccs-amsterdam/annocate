import { CircleHelp, X } from "lucide-react";
import { Button } from "../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "../ui/drawer";

interface Props {
  className: string;
  size?: number;
  children: React.ReactNode;
}

export function HelpDrawer({ className, size = 32, children }: Props) {
  return (
    <Drawer direction="right">
      <DrawerTrigger className={className}>
        <CircleHelp size={size} />
      </DrawerTrigger>
      <DrawerContent className="fixed bottom-0 left-auto   right-0 mt-0 h-screen w-[500px] max-w-[90vw]  rounded-none bg-background p-3 py-0 ">
        <div className="prose overflow-auto pb-16 pt-10 dark:prose-invert">{children}</div>
        <DrawerClose>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-0 right-0 w-full rounded-none bg-background/40 hover:bg-foreground/20"
          >
            <X />
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
