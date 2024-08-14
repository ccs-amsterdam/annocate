import { DialogDescription } from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

export function SimpleDialog({
  trigger,
  children,
  open,
  setOpen,
  header,
  description,
  className,
}: {
  trigger?: React.ReactNode;
  header: string;
  description?: string;
  children: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild className="flex">
          {trigger}
        </DialogTrigger>
      ) : null}
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{header}</DialogTitle>
          <DialogDescription className={description ? "" : "invisible"}>{description || header}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
