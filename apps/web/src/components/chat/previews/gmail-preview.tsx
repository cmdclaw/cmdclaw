import { PreviewProps, IntegrationLogo } from "./preview-styles";

function toBasename(value: string): string {
  return value.split(/[\\/]/).pop() || value;
}

function extractAttachmentNames(
  args: Record<string, string | undefined>,
  command: string,
): string[] {
  const matches = command.matchAll(/--attachment(?:=|\s+)("([^"]+)"|'([^']+)'|([^\s]+))/g);
  const fromCommand = [...matches]
    .map((match) => match[2] || match[3] || match[4] || "")
    .filter(Boolean)
    .map((value) => toBasename(value));

  if (fromCommand.length > 0) {
    return fromCommand;
  }

  return args.attachment ? [toBasename(args.attachment)] : [];
}

export function GmailPreview({ operation, args, command }: PreviewProps) {
  switch (operation) {
    case "send":
    case "draft":
      return <GmailSendPreview args={args} command={command} operation={operation} />;
    default:
      return null;
  }
}

function GmailSendPreview({
  args,
  command,
  operation,
}: {
  args: Record<string, string | undefined>;
  command: string;
  operation: string;
}) {
  const to = args.to;
  const cc = args.cc;
  const bcc = args.bcc;
  const subject = args.subject;
  const body = args.body;
  const attachmentNames = extractAttachmentNames(args, command);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_gmail" size={16} />
        <span className="text-sm font-medium">
          {operation === "draft" ? "Create Email Draft" : "Send Email"}
        </span>
      </div>

      {/* Email header style */}
      <div className="bg-muted/50 rounded-t border border-b-0 p-3 text-sm">
        <div className="grid grid-cols-[60px_1fr] gap-1">
          <span className="text-muted-foreground">To:</span>
          <span className="font-medium">{to || "—"}</span>

          {cc && (
            <>
              <span className="text-muted-foreground">Cc:</span>
              <span>{cc}</span>
            </>
          )}

          {bcc && (
            <>
              <span className="text-muted-foreground">Bcc:</span>
              <span>{bcc}</span>
            </>
          )}

          <span className="text-muted-foreground">Subject:</span>
          <span className="font-medium">{subject || "(no subject)"}</span>

          {attachmentNames.length > 0 && (
            <>
              <span className="text-muted-foreground">Files:</span>
              <span>{attachmentNames.join(", ")}</span>
            </>
          )}
        </div>
      </div>

      {/* Email body */}
      <div className="bg-background rounded-b border p-3">
        <div className="text-sm whitespace-pre-wrap">{body || "(no content)"}</div>
      </div>
    </div>
  );
}
