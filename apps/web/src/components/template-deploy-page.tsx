"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COWORKER_AVAILABLE_INTEGRATION_TYPES } from "@/lib/integration-icons";
import { findTemplateById } from "@/lib/template-data";
import { buildTemplateDeployPayload } from "@/lib/template-deploy";
import { client } from "@/orpc/client";
import { useCreateCoworker } from "@/orpc/hooks";

const DEFAULT_COWORKER_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";

export function TemplateDeployPage({ templateId }: { templateId: string }) {
  const createCoworker = useCreateCoworker();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    const template = findTemplateById(templateId);
    if (!template) {
      setError("Template not found.");
      return;
    }

    startedRef.current = true;
    let cancelled = false;

    const deploy = async () => {
      try {
        const response = await fetch("/api/prompts/template-deploy");
        if (!response.ok) {
          throw new Error("Failed to load template deploy prompt.");
        }

        const promptTemplate = await response.text();
        const deployPayload = buildTemplateDeployPayload(template, promptTemplate);
        const result = await createCoworker.mutateAsync({
          ...deployPayload.createPayload,
          model: DEFAULT_COWORKER_BUILDER_MODEL,
          allowedIntegrations: COWORKER_AVAILABLE_INTEGRATION_TYPES,
        });

        try {
          const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
            id: result.id,
          });
          await client.generation.startGeneration({
            conversationId,
            content: deployPayload.initialBuilderMessage,
            model: DEFAULT_COWORKER_BUILDER_MODEL,
            autoApprove: true,
          });
        } catch (builderError) {
          console.error("Failed to start coworker builder generation:", builderError);
        }

        window.location.assign(`/coworkers/${result.id}`);
      } catch (deployError) {
        console.error("Failed to deploy coworker from template:", deployError);
        if (cancelled) {
          return;
        }
        startedRef.current = false;
        setError("Failed to deploy coworker. Please try again.");
      }
    };

    void deploy();

    return () => {
      cancelled = true;
    };
  }, [createCoworker, templateId]);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center">
      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>Deploying coworker template…</span>
        </div>
      )}
    </div>
  );
}
