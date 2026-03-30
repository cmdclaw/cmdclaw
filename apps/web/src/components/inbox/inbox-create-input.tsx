"use client";

import { Paperclip, Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { AttachmentData } from "@/components/prompt-bar";
import { Button } from "@/components/ui/button";

type CoworkerOption = {
  id: string;
  name: string;
};

type Props = {
  coworkers: CoworkerOption[];
  onSubmit: (input: {
    coworkerId: string;
    message: string;
    attachments: AttachmentData[];
  }) => Promise<void> | void;
  isSubmitting?: boolean;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(file);
  });
}

export function InboxCreateInput({ coworkers, onSubmit, isSubmitting }: Props) {
  const [message, setMessage] = useState("");
  const [selectedCoworkerId, setSelectedCoworkerId] = useState(coworkers[0]?.id ?? "");
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!selectedCoworkerId || !trimmed) {
      return;
    }

    await onSubmit({
      coworkerId: selectedCoworkerId,
      message: trimmed,
      attachments,
    });
    setMessage("");
    setAttachments([]);
  }, [attachments, message, onSubmit, selectedCoworkerId]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleMessageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  }, []);
  const handleCoworkerChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCoworkerId(event.target.value);
  }, []);
  const handleSubmitClick = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const handleFilesChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const nextFiles = files.slice(0, Math.max(0, MAX_FILES));
    const prepared = await Promise.all(
      nextFiles
        .filter((file) => file.size <= MAX_FILE_SIZE)
        .map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          dataUrl: await readFileAsDataUrl(file),
        })),
    );

    setAttachments((current) => [...current, ...prepared].slice(0, MAX_FILES));
    event.target.value = "";
  }, []);

  const handleRemoveAttachment = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const targetDataUrl = event.currentTarget.dataset.attachmentUrl;
    if (!targetDataUrl) {
      return;
    }
    setAttachments((current) =>
      current.filter((attachment) => attachment.dataUrl !== targetDataUrl),
    );
  }, []);

  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        await handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="space-y-3 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <Plus className="text-muted-foreground/40 h-4 w-4 shrink-0" />
        <input
          type="text"
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Trigger a coworker manually..."
          className="text-foreground placeholder:text-muted-foreground/40 h-7 flex-1 bg-transparent text-sm outline-none"
          disabled={isSubmitting || coworkers.length === 0}
        />
        <select
          value={selectedCoworkerId}
          onChange={handleCoworkerChange}
          disabled={isSubmitting || coworkers.length === 0}
          className="bg-background text-foreground border-border/50 h-8 rounded-md border px-2.5 text-[12px] outline-none"
        >
          {coworkers.length === 0 ? <option value="">No active coworkers</option> : null}
          {coworkers.map((coworker) => (
            <option key={coworker.id} value={coworker.id}>
              {coworker.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleAttachClick}
          disabled={isSubmitting || coworkers.length === 0}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8"
          onClick={handleSubmitClick}
          disabled={
            isSubmitting || coworkers.length === 0 || !message.trim() || !selectedCoworkerId
          }
        >
          Run
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFilesChange}
        />
      </div>

      {attachments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.dataUrl}
              className="bg-secondary text-secondary-foreground flex items-center gap-2 rounded-md px-2 py-1 text-[11px]"
            >
              <span className="max-w-[200px] truncate">{attachment.name}</span>
              <button
                type="button"
                data-attachment-url={attachment.dataUrl}
                onClick={handleRemoveAttachment}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
