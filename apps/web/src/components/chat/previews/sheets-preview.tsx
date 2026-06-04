import { T, useGT } from "gt-react";
import {
  PreviewProps,
  PreviewField,
  PreviewSection,
  PreviewContent,
  PreviewBadge,
  IntegrationLogo,
} from "./preview-styles";

export function SheetsPreview({ operation, args, positionalArgs }: PreviewProps) {
  switch (operation) {
    case "create":
      return <SheetsCreatePreview args={args} />;
    case "append":
      return <SheetsAppendPreview args={args} positionalArgs={positionalArgs} />;
    case "update":
      return <SheetsUpdatePreview args={args} positionalArgs={positionalArgs} />;
    case "clear":
      return <SheetsClearPreview args={args} positionalArgs={positionalArgs} />;
    case "add-sheet":
      return <SheetsAddSheetPreview args={args} positionalArgs={positionalArgs} />;
    default:
      return null;
  }
}

function SheetsCreatePreview({ args }: { args: Record<string, string | undefined> }) {
  const title = args.title;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_sheets" size={16} />
        <span className="text-sm font-medium">
          <T>Create Spreadsheet</T>
        </span>
      </div>

      <PreviewSection>
        <div className="bg-muted/30 flex items-center gap-2 rounded border p-3">
          <IntegrationLogo integration="google_sheets" size={20} />
          <span className="font-medium">{title || "Untitled Spreadsheet"}</span>
        </div>
      </PreviewSection>
    </div>
  );
}

function SheetsAppendPreview({
  args,
  positionalArgs,
}: {
  args: Record<string, string | undefined>;
  positionalArgs: string[];
}) {
  const t = useGT();

  const spreadsheetId = positionalArgs[0];
  const range = args.range;
  const values = args.values;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_sheets" size={16} />
        <span className="text-sm font-medium">
          <T>Append Rows</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Spreadsheet")} value={spreadsheetId} mono />
        <PreviewField label={t("Range")} value={range} mono />
      </PreviewSection>

      {values && (
        <PreviewSection title={t("Data")}>
          <ValuesPreview values={values} />
        </PreviewSection>
      )}
    </div>
  );
}

function SheetsUpdatePreview({
  args,
  positionalArgs,
}: {
  args: Record<string, string | undefined>;
  positionalArgs: string[];
}) {
  const t = useGT();

  const spreadsheetId = positionalArgs[0];
  const range = args.range;
  const values = args.values;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_sheets" size={16} />
        <span className="text-sm font-medium">
          <T>Update Cells</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Spreadsheet")} value={spreadsheetId} mono />
        <PreviewField label={t("Range")} value={range} mono />
      </PreviewSection>

      {values && (
        <PreviewSection title={t("New Values")}>
          <ValuesPreview values={values} />
        </PreviewSection>
      )}
    </div>
  );
}

function SheetsClearPreview({
  args,
  positionalArgs,
}: {
  args: Record<string, string | undefined>;
  positionalArgs: string[];
}) {
  const t = useGT();

  const spreadsheetId = positionalArgs[0];
  const range = args.range;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_sheets" size={16} />
        <span className="text-sm font-medium">
          <T>Clear Cells</T>
        </span>
        <PreviewBadge variant="danger">
          <T>Destructive</T>
        </PreviewBadge>
      </div>

      <PreviewSection>
        <PreviewField label={t("Spreadsheet")} value={spreadsheetId} mono />
        <PreviewField label={t("Range")} value={range} mono />
      </PreviewSection>
    </div>
  );
}

function SheetsAddSheetPreview({
  args,
  positionalArgs,
}: {
  args: Record<string, string | undefined>;
  positionalArgs: string[];
}) {
  const t = useGT();

  const spreadsheetId = positionalArgs[0];
  const title = args.title;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <IntegrationLogo integration="google_sheets" size={16} />
        <span className="text-sm font-medium">
          <T>Add Sheet</T>
        </span>
      </div>

      <PreviewSection>
        <PreviewField label={t("Spreadsheet")} value={spreadsheetId} mono />
        <PreviewField label={t("Sheet Name")} value={title} />
      </PreviewSection>
    </div>
  );
}

function ValuesPreview({ values }: { values: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(values);
  } catch {
    // Fall through to raw display
  }

  if (Array.isArray(parsed)) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {parsed.slice(0, 5).map((row) => (
              <tr key={JSON.stringify(row)}>
                {Array.isArray(row) ? (
                  row.map((cell) => (
                    <td key={String(cell)} className="bg-muted/30 border px-2 py-1">
                      {String(cell)}
                    </td>
                  ))
                ) : (
                  <td className="bg-muted/30 border px-2 py-1">{String(row)}</td>
                )}
              </tr>
            ))}
            {parsed.length > 5 && (
              <tr>
                <td className="text-muted-foreground border px-2 py-1 text-center" colSpan={100}>
                  <T>... and</T> {parsed.length - 5} <T>more rows</T>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return <PreviewContent>{values}</PreviewContent>;
}
