import { JobServer } from "@/app/types";
import UnitProvider from "../UnitProvider/UnitProvider";
import QuestionTask from "./QuestionTask";
import { ReactNode } from "react";
import ResponsiveButtonGroup from "../ui/ResponsiveButtonGroup";
import { DarkModeButton } from "../Common/Theme";

interface Props {
  children?: ReactNode;
  jobServer: JobServer;
  blockEvents?: boolean;
}

export function AnnotationInterface({ children, jobServer, blockEvents }: Props) {
  return (
    <UnitProvider jobServer={jobServer}>
      <div
        className="relative grid h-full grid-rows-[min-content,1fr] 
      "
      >
        <IndexController />
        <QuestionTask blockEvents={blockEvents} />
      </div>
      {children}
    </UnitProvider>
  );
}

function IndexController() {
  return (
    <div className="z-20 flex items-center justify-between gap-2 border-b border-foreground bg-gradient-to-r from-foreground to-primary px-3 py-2 text-primary-foreground">
      <div>test</div>
      <div>
        <ResponsiveButtonGroup>
          <DarkModeButton />
        </ResponsiveButtonGroup>
      </div>
    </div>
  );
}
