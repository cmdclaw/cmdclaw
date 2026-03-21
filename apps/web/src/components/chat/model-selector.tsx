"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { Check, ChevronDown, Lock } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ModelOption = {
  id: string;
  name: string;
};

type CmdClawModelOption = ModelOption & {
  requiresSharedAuth: boolean;
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

function sortModels<T extends ModelOption>(models: T[]): T[] {
  return models.toSorted((a, b) => compareModelNames(a.name, b.name));
}

const CMDCLAW_MODELS: CmdClawModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    requiresSharedAuth: false,
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    requiresSharedAuth: true,
  },
];

const PERSONAL_CHATGPT_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
  },
];

const SORTED_CMDCLAW_MODELS = sortModels(CMDCLAW_MODELS);
const SORTED_PERSONAL_CHATGPT_MODELS = sortModels(PERSONAL_CHATGPT_MODELS);

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

type CmdClawSectionProps = {
  availability: Props["availability"];
  selectedModel: string;
  selectedAuthSource: ProviderAuthSource | null;
  onSelectionChange: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
};

type PersonalSectionProps = {
  selectedModel: string;
  selectedAuthSource: ProviderAuthSource | null;
  onSelectionChange: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
};

function CmdClawModelsSection({
  availability,
  selectedModel,
  selectedAuthSource,
  onSelectionChange,
}: CmdClawSectionProps) {
  const handleModelSelect = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const modelId = event.currentTarget.dataset.modelId;
      const authSourceValue = event.currentTarget.dataset.authSource;
      if (!modelId) {
        return;
      }

      onSelectionChange({
        model: modelId,
        authSource:
          authSourceValue === "shared" ? "shared" : authSourceValue === "user" ? "user" : null,
      });
    },
    [onSelectionChange],
  );

  return (
    <>
      <DropdownMenuLabel>CmdClaw Models</DropdownMenuLabel>
      {SORTED_CMDCLAW_MODELS.map((model) => {
        const isLocked = model.requiresSharedAuth && !availability.shared;
        const isSelected = model.requiresSharedAuth
          ? selectedModel === model.id && selectedAuthSource === "shared"
          : selectedModel === model.id;

        return (
          <DropdownMenuItem
            key={`cmdclaw-${model.id}`}
            data-testid={`chat-model-option-cmdclaw-${model.id}`}
            data-model-id={model.id}
            data-auth-source={model.requiresSharedAuth ? "shared" : ""}
            disabled={isLocked}
            onClick={handleModelSelect}
          >
            <span className="flex-1">{model.name}</span>
            {isLocked ? <Lock className="text-muted-foreground h-3.5 w-3.5" /> : null}
            {isSelected ? <Check className="text-foreground h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function PersonalChatGPTSection({
  selectedModel,
  selectedAuthSource,
  onSelectionChange,
}: PersonalSectionProps) {
  const handleModelSelect = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const modelId = event.currentTarget.dataset.modelId;
      if (!modelId) {
        return;
      }

      onSelectionChange({
        model: modelId,
        authSource: "user",
      });
    },
    [onSelectionChange],
  );

  return (
    <>
      <DropdownMenuLabel>Your ChatGPT</DropdownMenuLabel>
      {SORTED_PERSONAL_CHATGPT_MODELS.map((model) => (
        <DropdownMenuItem
          key={`user-${model.id}`}
          data-testid={`chat-model-option-user-${model.id}`}
          data-model-id={model.id}
          onClick={handleModelSelect}
        >
          <span className="flex-1">{model.name}</span>
          {selectedModel === model.id && selectedAuthSource === "user" ? (
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
  const allModels = [...CMDCLAW_MODELS, ...PERSONAL_CHATGPT_MODELS];
  const currentModel = allModels.find((model) => model.id === selectedModel);
  const displayName = currentModel?.name ?? selectedModel;
  const openSubscriptions = useCallback(() => {
    window.location.href = "/settings/subscriptions";
  }, []);

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
        <CmdClawModelsSection
          availability={availability}
          selectedModel={selectedModel}
          selectedAuthSource={selectedAuthSource}
          onSelectionChange={onSelectionChange}
        />

        <DropdownMenuSeparator />

        {availability.user ? (
          <PersonalChatGPTSection
            selectedModel={selectedModel}
            selectedAuthSource={selectedAuthSource}
            onSelectionChange={onSelectionChange}
          />
        ) : (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              Your ChatGPT
              <Lock className="text-muted-foreground h-3 w-3" />
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="text-muted-foreground text-xs"
              onClick={openSubscriptions}
              data-testid="chat-model-open-subscriptions"
            >
              Connect in Settings to unlock
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
