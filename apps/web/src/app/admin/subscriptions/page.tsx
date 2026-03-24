"use client";

import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useAdminSharedProviderAuthStatus,
  useConnectAdminSharedProvider,
  useDisconnectAdminSharedProvider,
  usePollAdminSharedProviderConnection,
} from "@/orpc/hooks";

type DeviceFlowState = {
  provider: "openai";
  flowId: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  interval: number;
  expiresAt: number;
};

export default function AdminSubscriptionsPage() {
  const { data, isLoading, refetch } = useAdminSharedProviderAuthStatus();
  const connectProvider = useConnectAdminSharedProvider();
  const pollProvider = usePollAdminSharedProviderConnection();
  const disconnectProvider = useDisconnectAdminSharedProvider();
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!deviceFlow) {
      return;
    }

    if (Date.now() >= deviceFlow.expiresAt) {
      toast.error("Device code expired. Start the connection again.");
      setDeviceFlow(null);
      return;
    }

    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const result = await pollProvider.mutateAsync({
            provider: deviceFlow.provider,
            flowId: deviceFlow.flowId,
          });

          if (result.status === "connected") {
            await refetch();
            toast.success("Shared GPT-5.4 connected to CmdClaw Models.");
            setDeviceFlow(null);
            return;
          }

          if (result.status === "failed") {
            toast.error(`Connection failed: ${result.error.replace(/_/g, " ")}`);
            setDeviceFlow(null);
            return;
          }

          if (result.status === "pending" && result.interval) {
            setDeviceFlow((prev) => (prev ? { ...prev, interval: result.interval } : prev));
          }
        } catch (error) {
          console.error("Failed polling shared provider auth:", error);
        }
      })();
    }, deviceFlow.interval * 1000);

    return () => clearTimeout(timeout);
  }, [deviceFlow, pollProvider, refetch]);

  const handleConnect = useCallback(async () => {
    try {
      const result = await connectProvider.mutateAsync("openai");
      setDeviceFlow({
        provider: "openai",
        flowId: result.flowId,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        verificationUriComplete: result.verificationUriComplete,
        interval: result.interval,
        expiresAt: Date.now() + result.expiresIn * 1000,
      });
    } catch (error) {
      console.error("Failed to start shared provider connection:", error);
      toast.error("Failed to start connection. Please try again.");
    }
  }, [connectProvider]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectProvider.mutateAsync("openai");
      toast.success("Shared GPT-5.4 disconnected from CmdClaw Models.");
    } catch (error) {
      console.error("Failed to disconnect shared provider:", error);
      toast.error("Failed to disconnect. Please try again.");
    }
  }, [disconnectProvider]);

  const handleCopyDeviceCode = useCallback(() => {
    if (!deviceFlow) {
      return;
    }

    void (async () => {
      try {
        await navigator.clipboard.writeText(deviceFlow.userCode);
        setCopySuccess(true);
        if (copyFeedbackTimeoutRef.current) {
          clearTimeout(copyFeedbackTimeoutRef.current);
        }
        copyFeedbackTimeoutRef.current = window.setTimeout(() => {
          setCopySuccess(false);
        }, 1800);
      } catch (error) {
        console.error("Failed to copy device code:", error);
      }
    })();
  }, [deviceFlow]);

  const handleOpenVerificationPage = useCallback(() => {
    if (!deviceFlow) {
      return;
    }

    window.open(deviceFlow.verificationUriComplete);
  }, [deviceFlow]);

  const isConnected = Boolean(data?.connected?.openai);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Shared CmdClaw Models</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Claude Sonnet 4.6 is built into CmdClaw Models. Connect shared ChatGPT access to add
          GPT-5.4 and GPT-5.4 Mini for every user in the shared model selector.
        </p>
      </div>

      <div className="bg-card rounded-lg border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-xl border">
              <Image
                src="/integrations/openai.svg"
                alt="OpenAI logo"
                width={24}
                height={24}
                className="dark:invert"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">CmdClaw Models</h3>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Shared ChatGPT models active
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Claude Sonnet 4.6 is always available. Connecting ChatGPT here unlocks GPT-5.4 and
                GPT-5.4 Mini in CmdClaw Models for all users.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Claude Sonnet 4.6", "GPT-5.4", "GPT-5.4 Mini"].map((model) => (
                  <span
                    key={model}
                    className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-medium"
                  >
                    {model}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                GPT-5.4 and GPT-5.4 Mini use the shared ChatGPT connection. Claude Sonnet 4.6 is
                CmdClaw-managed.
              </p>
            </div>
          </div>

          {isLoading ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectProvider.isPending}
            >
              {disconnectProvider.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={connectProvider.isPending}>
              {connectProvider.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Connect
            </Button>
          )}
        </div>

        {deviceFlow ? (
          <div className="mt-6 rounded-xl border p-4">
            <p className="text-sm font-medium">Finish shared ChatGPT connection</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Open the verification page and approve ChatGPT access so GPT-5.4 and GPT-5.4 Mini
              become available in CmdClaw Models.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="outline" onClick={handleOpenVerificationPage}>
                Open verification page
              </Button>
              <Button variant="secondary" onClick={handleCopyDeviceCode}>
                {copySuccess ? "Copied code" : `Copy code: ${deviceFlow.userCode}`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
