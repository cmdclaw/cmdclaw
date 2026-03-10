"use client";

import type { DialogContentProps } from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  const [reportMessage, setReportMessage] = useState("");
  const [reportAttachment, setReportAttachment] = useState<File | null>(null);
  const [reportError, setReportError] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resetForm = useCallback(() => {
    setReportMessage("");
    setReportAttachment(null);
    setReportError("");
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !isSubmittingReport) {
        resetForm();
      }
      onOpenChange(nextOpen);
    },
    [isSubmittingReport, onOpenChange, resetForm],
  );

  const handleSubmitReport = useCallback(async () => {
    const trimmedMessage = reportMessage.trim();
    if (!trimmedMessage) {
      setReportError("Please describe the bug.");
      return;
    }

    setIsSubmittingReport(true);
    setReportError("");

    try {
      const formData = new FormData();
      formData.append("message", trimmedMessage);
      if (reportAttachment) {
        formData.append("attachment", reportAttachment);
      }

      const response = await fetch("/api/report", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setReportError(data?.error ?? "Failed to send report.");
        return;
      }

      resetForm();
      onOpenChange(false);
    } catch {
      setReportError("Failed to send report.");
    } finally {
      setIsSubmittingReport(false);
    }
  }, [onOpenChange, reportAttachment, reportMessage, resetForm]);

  const handleReportMessageChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setReportMessage(event.target.value);
      if (reportError) {
        setReportError("");
      }
    },
    [reportError],
  );

  const handleAttachmentChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setReportAttachment(file);
  }, []);

  const openAttachmentPicker = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const clearAttachment = useCallback(() => {
    setReportAttachment(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, []);

  const handleOpenAutoFocus = useCallback<NonNullable<DialogContentProps["onOpenAutoFocus"]>>(
    (event) => {
      event.preventDefault();
      textareaRef.current?.focus();
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={handleOpenAutoFocus}
        className="grid max-h-[min(90vh,720px)] w-[calc(100vw-1.5rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:w-full"
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
        <div className="overflow-y-auto px-4 py-4 sm:px-6">
          <textarea
            ref={textareaRef}
            value={reportMessage}
            onChange={handleReportMessageChange}
            placeholder="Describe the bug..."
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[180px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            onChange={handleAttachmentChange}
          />
          {reportAttachment ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                {reportAttachment.name}
              </span>
              <Button type="button" variant="ghost" onClick={clearAttachment}>
                Remove
              </Button>
            </div>
          ) : null}
          {reportError ? <p className="text-destructive mt-2 text-xs">{reportError}</p> : null}
        </div>
        <DialogFooter className="items-center px-4 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={openAttachmentPicker}>
            Add attachment
          </Button>
          <Button onClick={handleSubmitReport} disabled={isSubmittingReport}>
            {isSubmittingReport ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
