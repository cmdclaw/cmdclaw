"use client";

import { X } from "lucide-react";
import { useCallback } from "react";
import { BugReportForm } from "@/components/bug-report-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BugReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const dialogContentStyle = {
  top: "max(50%, calc(50% + var(--safe-area-inset-top) / 2))",
};

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const handleSuccess = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="grid max-h-[min(90vh,720px)] w-[calc(100vw-1.5rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:w-full"
        style={dialogContentStyle}
      >
        <DialogClose className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <DialogHeader className="px-4 py-4 sm:px-6">
          <DialogTitle>Bug report</DialogTitle>
          <DialogDescription>Send a message to the CmdClaw team.</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          <BugReportForm onSuccess={handleSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
