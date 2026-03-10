"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getIntegrationActions } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type IntegrationInfo = {
  id: string;
  type: string;
  enabled: boolean;
  displayName: string | null;
  setupRequired?: boolean;
};

export type IntegrationDetailProps = {
  type: string;
  config: { name: string; description: string; icon: string };
  integration: IntegrationInfo | null;
  isWhatsApp: boolean;
  connectError?: string;
  showGoogleRequest: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onToggle: (enabled: boolean) => void;
  onDisconnect: () => void;
  onRequestGoogleAccess: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function IntegrationDetailContent({
  type,
  config,
  integration,
  isWhatsApp,
  connectError,
  showGoogleRequest,
  isConnecting,
  onConnect,
  onToggle,
  onDisconnect,
  onRequestGoogleAccess,
}: IntegrationDetailProps) {
  const actions = isWhatsApp ? [] : getIntegrationActions(type);
  const isConnected = !!integration;
  const isEnabled = integration?.enabled ?? false;

  const handleToggle = useCallback(
    (value: boolean) => {
      onToggle(value);
    },
    [onToggle],
  );

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {/* ── Hero section ── */}
      <div className="grid grid-cols-1 gap-12 pb-16 md:grid-cols-[1fr_1.3fr] md:gap-16">
        {/* Intro */}
        <div className="flex flex-col">
          {/* Integration icon */}
          <div className="mb-5 inline-flex size-14 items-center justify-center rounded-xl border bg-white p-2.5 shadow-sm dark:bg-gray-800">
            <Image
              src={config.icon}
              alt={config.name}
              width={28}
              height={28}
              className="h-auto max-h-7 w-auto max-w-7 object-contain"
            />
          </div>

          <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl md:leading-snug">
            {config.name}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-[38ch] text-sm leading-relaxed">
            {config.description}
          </p>

          {/* Status */}
          <div className="mt-5 flex items-center gap-2">
            {isConnected ? (
              <>
                <span
                  className={cn(
                    "inline-block size-2 rounded-full",
                    isEnabled ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    isEnabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {isEnabled ? "Connected" : "Disabled"}
                </span>
                {integration.displayName && (
                  <span className="text-muted-foreground text-xs">· {integration.displayName}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs font-medium">Not connected</span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 flex items-center gap-3">
            {isConnected && !integration.setupRequired ? (
              <>
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch checked={isEnabled} onCheckedChange={handleToggle} />
                  <span className="text-muted-foreground text-sm">
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={onDisconnect}
                >
                  Disconnect
                </Button>
              </>
            ) : isWhatsApp ? (
              <Button className="gap-1.5 rounded-lg px-5" asChild>
                <Link href="/integrations/whatsapp">
                  Setup
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            ) : showGoogleRequest ? (
              <Button
                variant="outline"
                className="gap-1.5 rounded-lg px-5"
                onClick={onRequestGoogleAccess}
              >
                Request access
              </Button>
            ) : (
              <Button
                className="gap-1.5 rounded-lg px-5"
                onClick={onConnect}
                disabled={isConnecting}
                variant={connectError ? "destructive" : "default"}
              >
                {isConnecting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                {isConnecting ? "Connecting" : connectError ? "Retry" : "Connect"}
              </Button>
            )}
          </div>

          {connectError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {connectError}
            </div>
          )}

          {/* Metadata */}
          <div className="mt-12 space-y-6">
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-widest uppercase">
                Type
              </p>
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                Integration
              </span>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-widest uppercase">
                Capabilities
              </p>
              <p className="text-sm">
                {actions.length} action{actions.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div>
          <section>
            <div className="mb-5">
              <h2 className="text-sm font-semibold">Available actions</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                What your coworker can do with this integration
              </p>
            </div>

            {actions.length > 0 ? (
              <div className="grid grid-cols-1 gap-3.5">
                {actions.map((action) => (
                  <div
                    key={action.key}
                    className="border-border/40 bg-card rounded-xl border p-5 shadow-sm"
                  >
                    <p className="text-sm leading-snug font-medium">{action.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-border/40 bg-card rounded-xl border p-6 shadow-sm">
                <p className="text-muted-foreground text-sm">
                  No capabilities are listed for this integration yet.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
