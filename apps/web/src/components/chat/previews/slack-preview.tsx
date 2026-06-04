import { T, useGT } from "gt-react";
import {
  PreviewProps,
  PreviewField,
  PreviewSection,
  PreviewContent,
  PreviewBadge,
  IntegrationLogo,
} from "./preview-styles";

export function SlackPreview({ operation, args }: PreviewProps) {
  switch (operation) {
    case "send":
      return <SlackSendPreview args={args} />;
    case "react":
      return <SlackReactPreview args={args} />;
    case "upload":
      return <SlackUploadPreview args={args} />;
    default:
      return null;
  }
}

function SlackSendPreview({ args }: { args: Record<string, string | undefined> }) {
  const t = useGT();

  const channel = args.c || args.channel;
  const text = args.t || args.text;
  const thread = args.thread;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="slack" size={16} />
        <span className="text-sm font-medium">{thread ? "Reply to Thread" : "Send Message"}</span>
        {thread && (
          <PreviewBadge>
            <T>In Thread</T>
          </PreviewBadge>
        )}
      </div>

      <PreviewSection>
        <PreviewField label={t("Channel")} value={channel} mono />
        {thread && <PreviewField label={t("Thread")} value={thread} mono />}
      </PreviewSection>

      {text && (
        <PreviewSection title={t("Message")}>
          <PreviewContent>{text}</PreviewContent>
        </PreviewSection>
      )}
    </div>
  );
}

function SlackReactPreview({ args }: { args: Record<string, string | undefined> }) {
  const t = useGT();

  const channel = args.c || args.channel;
  const timestamp = args.ts;
  const emoji = args.e || args.emoji;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="slack" size={16} />
        <span className="text-sm font-medium">
          <T>Add Reaction</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Channel")} value={channel} mono />
        <PreviewField label={t("Message")} value={timestamp} mono />
        <div className="mt-2">
          <span className="text-muted-foreground text-xs font-medium">
            <T>Emoji:</T>{" "}
          </span>
          <span className="text-lg">:{emoji}:</span>
        </div>
      </PreviewSection>
    </div>
  );
}

function SlackUploadPreview({ args }: { args: Record<string, string | undefined> }) {
  const t = useGT();

  const channel = args.c || args.channel;
  const file = args.file;
  const comment = args.comment;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="slack" size={16} />
        <span className="text-sm font-medium">
          <T>Upload File</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Channel")} value={channel} mono />
        <PreviewField label={t("File")} value={file} />
      </PreviewSection>

      {comment && (
        <PreviewSection title={t("Comment")}>
          <PreviewContent>{comment}</PreviewContent>
        </PreviewSection>
      )}
    </div>
  );
}
