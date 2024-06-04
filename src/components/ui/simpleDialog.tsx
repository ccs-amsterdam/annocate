import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

export function SimpleDialog({
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
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild className="flex">
          {trigger}
        </DialogTrigger>
      ) : null}
      <DialogContent className={className}>
        {header ? (
          <DialogHeader>
            <DialogTitle>{header}</DialogTitle>
          </DialogHeader>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}
