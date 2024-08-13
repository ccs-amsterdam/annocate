import { CircleHelp, X } from "lucide-react";
import { Button } from "../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "../ui/drawer";

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: number;
}

export function HelpDrawer({ title, className, size = 32, children }: Props) {
  return (
    <Drawer direction="right">
      <DrawerTrigger className={className}>
        <CircleHelp size={size} />
      </DrawerTrigger>
      <DrawerContent className="fixed bottom-0 left-auto   right-0 mt-0 h-screen w-[500px] max-w-[90vw]  rounded-none bg-background p-3  ">
        <DrawerTitle>{title}</DrawerTitle>
        <div className="prose overflow-auto pb-16 pt-10 dark:prose-invert">{children}</div>
        <DrawerClose className="mt-auto">
          <Button variant="outline" size="icon" className="mt-auto w-full bg-background/40 hover:bg-foreground/20">
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
