"use client";

import { FileCode, Puzzle } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getBrandfetchLogoUrl } from "@/lib/brandfetch";
import { cn } from "@/lib/utils";

export function ExecutorSourceLogo({
  kind,
  endpoint,
  className,
  imgClassName,
  iconClassName,
}: {
  kind: "mcp" | "openapi";
  endpoint: string;
  className?: string;
  imgClassName?: string;
  iconClassName?: string;
}) {
  const logoUrl = getBrandfetchLogoUrl(endpoint);
  const [logoFailed, setLogoFailed] = useState(false);
  const handleError = useCallback(() => {
    setLogoFailed(true);
  }, []);

  useEffect(() => {
    setLogoFailed(false);
  }, [endpoint]);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg",
        logoUrl && !logoFailed ? "border bg-white p-1 shadow-sm" : "bg-muted/60",
        className,
      )}
    >
      {logoUrl && !logoFailed ? (
        <Image
          src={logoUrl}
          alt=""
          width={80}
          height={80}
          className={cn("h-full w-full rounded-md object-contain", imgClassName)}
          unoptimized
          onError={handleError}
        />
      ) : kind === "mcp" ? (
        <Puzzle className={cn("text-foreground h-5 w-5", iconClassName)} />
      ) : (
        <FileCode className={cn("text-foreground h-5 w-5", iconClassName)} />
      )}
    </div>
  );
}
