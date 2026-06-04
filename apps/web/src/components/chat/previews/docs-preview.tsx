import { T, useGT } from "gt-react";
import {
  PreviewProps,
  PreviewField,
  PreviewSection,
  PreviewContent,
  IntegrationLogo,
} from "./preview-styles";

export function DocsPreview({ operation, args, positionalArgs }: PreviewProps) {
  switch (operation) {
    case "create":
      return <DocsCreatePreview args={args} />;
    case "append":
      return <DocsAppendPreview args={args} positionalArgs={positionalArgs} />;
    default:
      return null;
  }
}

function DocsCreatePreview({ args }: { args: Record<string, string | undefined> }) {
  const title = args.title;
  const content = args.content;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_docs" size={16} />
        <span className="text-sm font-medium">
          <T>Create Document</T>
        </span>
      </div>

      <PreviewSection>
        <div className="dark:bg-muted/30 rounded border bg-white p-4">
          <div className="mb-2 border-b pb-2 text-lg font-medium">
            {title || "Untitled Document"}
          </div>

          {content && (
            <div className="text-muted-foreground text-sm whitespace-pre-wrap">{content}</div>
          )}

          {!content && (
            <div className="text-muted-foreground text-sm italic">
              <T>Empty document</T>
            </div>
          )}
        </div>
      </PreviewSection>
    </div>
  );
}

function DocsAppendPreview({
  args,
  positionalArgs,
}: {
  args: Record<string, string | undefined>;
  positionalArgs: string[];
}) {
  const t = useGT();

  const documentId = positionalArgs[0];
  const text = args.text;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_docs" size={16} />
        <span className="text-sm font-medium">
          <T>Append to Document</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Document ID")} value={documentId} mono />
      </PreviewSection>

      {text && (
        <PreviewSection title={t("Content to Append")}>
          <PreviewContent>{text}</PreviewContent>
        </PreviewSection>
      )}
    </div>
  );
}
