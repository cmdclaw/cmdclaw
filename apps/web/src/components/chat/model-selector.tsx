"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { ChevronDown, Check, Lock } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
// import { useOpencodeFreeModels } from "@/orpc/hooks";

type ModelOption = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
};

type SortToken = { type: "text"; value: string } | { type: "number"; value: number };

function tokenizeModelName(name: string): SortToken[] {
  return name
    .split(/(\d+(?:\.\d+)?)/)
    .filter((token) => token.length > 0)
    .map((token) =>
      /^\d+(?:\.\d+)?$/.test(token)
        ? { type: "number", value: Number(token) }
        : { type: "text", value: token.toLowerCase() },
    );
}

function compareModelNames(a: string, b: string): number {
  const aTokens = tokenizeModelName(a);
  const bTokens = tokenizeModelName(b);
  const maxLength = Math.max(aTokens.length, bTokens.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aToken = aTokens[index];
    const bToken = bTokens[index];

    if (!aToken || !bToken) {
      break;
    }

    if (aToken.type === "number" && bToken.type === "number" && aToken.value !== bToken.value) {
      return bToken.value - aToken.value;
    }

    if (aToken.type === "text" && bToken.type === "text" && aToken.value !== bToken.value) {
      return aToken.value.localeCompare(bToken.value);
    }

    if (aToken.type !== bToken.type) {
      return aToken.type === "text" ? -1 : 1;
    }
  }

  if (aTokens.length !== bTokens.length) {
    return aTokens.length - bTokens.length;
  }

  return a.localeCompare(b);
}

function sortModels(models: ModelOption[]): ModelOption[] {
  return models.toSorted((a, b) => compareModelNames(a.name, b.name));
}

const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    providerLabel: "Anthropic",
  },
];

const OPENAI_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    providerLabel: "ChatGPT",
  },
  // {
  //   id: "openai/gpt-5.4-mini",
  //   name: "GPT-5.4 Mini",
  //   provider: "openai",
  //   providerLabel: "ChatGPT",
  // },
];

const SORTED_ANTHROPIC_MODELS = sortModels(ANTHROPIC_MODELS);
const SORTED_OPENAI_MODELS = sortModels(OPENAI_MODELS);

type Props = {
  selectedModel: string;
  selectedAuthSource: ProviderAuthSource | null;
  availability: {
    user: boolean;
    shared: boolean;
  };
  onSelectionChange: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
  disabled?: boolean;
};

type SourceSectionProps = {
  label: string;
  authSource: ProviderAuthSource;
  selectedModel: string;
  selectedAuthSource: ProviderAuthSource | null;
  onSelectionChange: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
};

function SourceSection({
  label,
  authSource,
  selectedModel,
  selectedAuthSource,
  onSelectionChange,
}: SourceSectionProps) {
  const handleModelSelect = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const modelId = event.currentTarget.dataset.modelId;
      if (!modelId) {
        return;
      }

      onSelectionChange({
        model: modelId,
        authSource,
      });
    },
    [authSource, onSelectionChange],
  );

  return (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {SORTED_OPENAI_MODELS.map((model) => (
        <DropdownMenuItem
          key={`${authSource}-${model.id}`}
          data-testid={`chat-model-option-${authSource}-${model.id}`}
          data-model-id={model.id}
          onClick={handleModelSelect}
        >
          <span className="flex-1">{model.name}</span>
          {selectedModel === model.id && selectedAuthSource === authSource ? (
            <Check className="text-foreground h-3.5 w-3.5" />
          ) : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function ModelSelector({
  selectedModel,
  selectedAuthSource,
  availability,
  onSelectionChange,
  disabled,
}: Props) {
  // const { data: freeModelsData } = useOpencodeFreeModels();
  // const zenModels: ModelOption[] = sortModels(
  //   (freeModelsData?.models ?? []).map((model) => ({
  //     id: model.id,
  //     name: model.name,
  //     provider: "opencode",
  //     providerLabel: "OpenCode Zen",
  //   })),
  // );
  // OpenCode Zen free models are intentionally hidden from the selector for now.
  const allModels = [
    ...ANTHROPIC_MODELS,
    ...OPENAI_MODELS,
    // ...zenModels,
  ];

  const currentModel = allModels.find((m) => m.id === selectedModel);
  const displayName = currentModel?.name ?? selectedModel;
  const openSubscriptions = useCallback(() => {
    window.location.href = "/settings/subscriptions";
  }, []);
  const handleSimpleModelSelect = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const modelId = event.currentTarget.dataset.modelId;
      if (!modelId) {
        return;
      }

      onSelectionChange({ model: modelId, authSource: null });
    },
    [onSelectionChange],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          data-testid="chat-model-selector"
          className="text-muted-foreground hover:text-foreground h-7 gap-1 px-2 text-xs"
        >
          {displayName}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Anthropic</DropdownMenuLabel>
        {SORTED_ANTHROPIC_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            data-testid={`chat-model-option-${model.id}`}
            data-model-id={model.id}
            onClick={handleSimpleModelSelect}
          >
            <span className="flex-1">{model.name}</span>
            {selectedModel === model.id ? <Check className="text-foreground h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}

        {/*
        {zenModels.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>OpenCode Zen</DropdownMenuLabel>
            {zenModels.map((model) => (
              <DropdownMenuItem
                key={model.id}
                data-testid={`chat-model-option-${model.id}`}
                data-model-id={model.id}
                onClick={handleSimpleModelSelect}
              >
                <span className="flex-1">{model.name}</span>
                {selectedModel === model.id ? (
                  <Check className="text-foreground h-3.5 w-3.5" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        */}

        <DropdownMenuSeparator />
        {availability.shared ? (
          <SourceSection
            label="CmdClaw ChatGPT"
            authSource="shared"
            selectedModel={selectedModel}
            selectedAuthSource={selectedAuthSource}
            onSelectionChange={onSelectionChange}
          />
        ) : null}
        {availability.shared && availability.user ? <DropdownMenuSeparator /> : null}
        {availability.user ? (
          <SourceSection
            label="Your ChatGPT"
            authSource="user"
            selectedModel={selectedModel}
            selectedAuthSource={selectedAuthSource}
            onSelectionChange={onSelectionChange}
          />
        ) : null}
        {!availability.shared && !availability.user ? (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              ChatGPT
              <Lock className="text-muted-foreground h-3 w-3" />
            </DropdownMenuLabel>
            <DropdownMenuItem className="text-muted-foreground text-xs" onClick={openSubscriptions}>
              Connect in Settings to unlock
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
