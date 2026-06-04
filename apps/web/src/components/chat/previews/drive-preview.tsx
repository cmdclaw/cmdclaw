import { T, useGT } from "gt-react";
import {
  PreviewProps,
  PreviewField,
  PreviewSection,
  PreviewBadge,
  IntegrationLogo,
} from "./preview-styles";

export function DrivePreview({ operation, args, positionalArgs }: PreviewProps) {
  switch (operation) {
    case "upload":
      return <DriveUploadPreview args={args} />;
    case "mkdir":
      return <DriveMkdirPreview args={args} />;
    case "delete":
      return <DriveDeletePreview positionalArgs={positionalArgs} />;
    default:
      return null;
  }
}

function DriveUploadPreview({ args }: { args: Record<string, string | undefined> }) {
  const t = useGT();

  const file = args.file;
  const name = args.name;
  const folder = args.folder;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_drive" size={16} />
        <span className="text-sm font-medium">
          <T>Upload File</T>
        </span>
      </div>

      <PreviewSection>
        <div className="bg-muted/30 rounded border p-3">
          <PreviewField label={t("File")} value={file} />
          {name && <PreviewField label={t("Save as")} value={name} />}
          {folder && <PreviewField label={t("Destination")} value={folder} mono />}
        </div>
      </PreviewSection>
    </div>
  );
}

function DriveMkdirPreview({ args }: { args: Record<string, string | undefined> }) {
  const t = useGT();

  const name = args.name;
  const parent = args.parent;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_drive" size={16} />
        <span className="text-sm font-medium">
          <T>Create Folder</T>
        </span>
      </div>

      <PreviewSection>
        <div className="bg-muted/30 flex items-center gap-2 rounded border p-3">
          <IntegrationLogo integration="google_drive" size={20} />
          <span className="font-medium">{name || "New Folder"}</span>
        </div>
        {parent && <PreviewField label={t("Parent Folder")} value={parent} mono />}
      </PreviewSection>
    </div>
  );
}

function DriveDeletePreview({ positionalArgs }: { positionalArgs: string[] }) {
  const t = useGT();

  const fileId = positionalArgs[0];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_drive" size={16} />
        <span className="text-sm font-medium">
          <T>Delete Item</T>
        </span>
        <PreviewBadge variant="danger">
          <T>Destructive</T>
        </PreviewBadge>
      </div>

      <PreviewSection>
        <PreviewField label={t("File/Folder ID")} value={fileId} mono />
      </PreviewSection>
    </div>
  );
}
