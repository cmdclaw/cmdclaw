"use client";

import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type BugReportFormProps = {
  onSuccess?: () => void;
};

export function BugReportForm({ onSuccess }: BugReportFormProps) {
  const [reportMessage, setReportMessage] = useState("");
  const [reportAttachment, setReportAttachment] = useState<File | null>(null);
  const [reportError, setReportError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = useCallback(async () => {
    const trimmedMessage = reportMessage.trim();
    if (!trimmedMessage) {
      setReportError("Please describe the bug.");
      return;
    }

    setIsSubmitting(true);
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
      onSuccess?.();
    } catch {
      setReportError("Failed to send report.");
    } finally {
      setIsSubmitting(false);
    }
  }, [onSuccess, reportAttachment, reportMessage, resetForm]);

  const handleMessageChange = useCallback(
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        <textarea
          ref={textareaRef}
          value={reportMessage}
          onChange={handleMessageChange}
          placeholder="Describe the bug..."
          autoFocus
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[220px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
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
            <button
              type="button"
              onClick={clearAttachment}
              className="text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {reportError ? <p className="text-destructive mt-2 text-xs">{reportError}</p> : null}
      </div>
      <div className="flex items-center gap-2 pt-4">
        <Button type="button" variant="outline" onClick={openAttachmentPicker} className="flex-1">
          Add attachment
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
