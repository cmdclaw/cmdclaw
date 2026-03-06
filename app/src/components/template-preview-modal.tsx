"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { TemplateDetailContent } from "@/components/template-detail-content";
import { getTemplateById } from "@/lib/template-data";

export function TemplatePreviewModal({ templateId }: { templateId: string | null }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    router.push("/templates", { scroll: false });
  }, [router]);

  // Close on Escape
  useEffect(() => {
    if (!templateId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [templateId, close]);

  // Lock body scroll when open
  useEffect(() => {
    if (!templateId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [templateId]);

  // Reset scroll position when template changes
  useEffect(() => {
    if (templateId && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [templateId]);

  const template = templateId ? getTemplateById(templateId) : null;

  return (
    <AnimatePresence>
      {template && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          {/* Window */}
          <motion.div
            key="window"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="bg-background border-border/60 fixed inset-0 z-50 m-auto flex h-[85vh] w-[85vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
          >
            {/* Title bar */}
            <div className="border-border/40 bg-muted/30 flex shrink-0 items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="bg-muted size-2.5 rounded-full" />
                <span className="text-muted-foreground max-w-[400px] truncate text-xs font-medium">
                  {template.title}
                </span>
              </div>
              <button
                onClick={close}
                className="text-muted-foreground hover:text-foreground hover:bg-muted -mr-1.5 flex size-7 items-center justify-center rounded-lg transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 pt-10 pb-16">
              <TemplateDetailContent template={template} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
