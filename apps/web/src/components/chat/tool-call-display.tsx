"use client";

import { ChevronDown, ChevronRight, Wrench, Check, Loader2, Laptop, Puzzle, FileCode } from "lucide-react";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { getBrandfetchLogoUrl } from "@/lib/brandfetch";
import { getExecutorDisplayMetadata } from "@/lib/executor-tool";
import {
  getIntegrationDisplayName,
  getIntegrationIcon,
  getIntegrationLogo,
} from "@/lib/integration-icons";
import { useExecutorSourceList } from "@/orpc/hooks";

type Props = {
  name: string;
  input: unknown;
  result?: unknown;
};

export function ToolCallDisplay({ name, input, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data: executorSourceData } = useExecutorSourceList();
  const isComplete = result !== undefined;
  const executorDisplay = useMemo(
    () => getExecutorDisplayMetadata(input, executorSourceData?.sources ?? []),
    [executorSourceData?.sources, input],
  );
  const formattedInput = useMemo(() => {
    if (executorDisplay.code) {
      if (executorDisplay.metadataInput === undefined || executorDisplay.metadataInput === null) {
        return null;
      }
      return JSON.stringify(executorDisplay.metadataInput, null, 2);
    }
    return JSON.stringify(input, null, 2);
  }, [executorDisplay.code, executorDisplay.metadataInput, input]);
  const formattedResult = useMemo(
    () => (typeof result === "string" ? result : JSON.stringify(result, null, 2)),
    [result],
  );
  const handleToggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);
  const icon = useMemo(() => {
    if (executorDisplay.source) {
      const logoUrl = executorDisplay.source.endpoint
        ? getBrandfetchLogoUrl(executorDisplay.source.endpoint)
        : null;
      if (logoUrl) {
        return (
          <Image
            src={logoUrl}
            alt={executorDisplay.source.name?.trim() || executorDisplay.source.namespace}
            width={16}
            height={16}
            className="h-4 w-auto rounded-sm"
            unoptimized
          />
        );
      }

      const SourceIcon = executorDisplay.source.kind === "mcp" ? Puzzle : FileCode;
      return <SourceIcon className="text-muted-foreground h-4 w-4" />;
    }

    if (executorDisplay.code) {
      if (!executorDisplay.integration) {
        return <Laptop className="text-muted-foreground h-4 w-4" />;
      }
    }

    if (!executorDisplay.integration) {
      return <Wrench className="text-muted-foreground h-4 w-4" />;
    }

    const logo = getIntegrationLogo(executorDisplay.integration);
    if (logo) {
      return (
        <Image
          src={logo}
          alt={getIntegrationDisplayName(executorDisplay.integration)}
          width={16}
          height={16}
          className="h-4 w-auto"
        />
      );
    }

    const IntegrationIcon = getIntegrationIcon(executorDisplay.integration);
    return IntegrationIcon ? (
      <IntegrationIcon className="text-muted-foreground h-4 w-4" />
    ) : (
      <Laptop className="text-muted-foreground h-4 w-4" />
    );
  }, [executorDisplay]);
  const title = executorDisplay.displayName ?? name;

  return (
    <div className="bg-card text-card-foreground rounded-lg border">
      <button
        onClick={handleToggleExpanded}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {icon}
        <span className="flex-1 font-mono text-xs">{title}</span>
        {isComplete ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2">
          {executorDisplay.code && (
            <div className="mb-2">
              <p className="text-muted-foreground text-xs font-medium">Code:</p>
              <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 font-mono text-[11px] leading-relaxed whitespace-pre">
                {executorDisplay.code}
              </pre>
            </div>
          )}
          {formattedInput && (
            <div className="mb-2">
              <p className="text-muted-foreground text-xs font-medium">
                {executorDisplay.code ? "Metadata:" : "Input:"}
              </p>
              <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs whitespace-pre-wrap">
                {formattedInput}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <p className="text-muted-foreground text-xs font-medium">Result:</p>
              <pre className="bg-muted mt-1 max-h-48 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                {formattedResult}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
