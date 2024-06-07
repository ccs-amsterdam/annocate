import { CircleHelp, LucideMessageCircleQuestion, MessageCircleQuestion, X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTrigger } from "../ui/drawer";
import Markdown from "./Markdown";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import { Button } from "../ui/button";

interface Props {
  children: React.ReactNode;
}

export function HelpDrawer({ children }: Props) {
  return (
    <Drawer direction="right">
      <DrawerTrigger className="fixed bottom-5 right-5">
        <CircleHelp size={32} />
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
