"use client";

import { motion } from "motion/react";

const LOGO_BAR_INITIAL = { opacity: 0, y: 10 } as const;
const LOGO_BAR_WHILE_IN_VIEW = { opacity: 1, y: 0 } as const;
const LOGO_BAR_VIEWPORT = { once: true } as const;
const LOGO_BAR_TRANSITION = { duration: 0.5 } as const;

export function LogoBar() {
  return (
    <section className="border-border/40 bg-background border-t px-6 py-10 md:py-12">
      <motion.div
        initial={LOGO_BAR_INITIAL}
        whileInView={LOGO_BAR_WHILE_IN_VIEW}
        viewport={LOGO_BAR_VIEWPORT}
        transition={LOGO_BAR_TRANSITION}
        className="mx-auto max-w-4xl"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-30 grayscale">
          {(
            ["Acme Corp", "TechFlow", "DataBridge", "ScaleOps", "NovaPay", "CloudFirst"] as const
          ).map((name) => (
            <div key={name} className="flex items-center gap-2">
              <div className="bg-foreground/80 size-5 rounded" />
              <span className="text-foreground text-sm font-semibold tracking-tight">{name}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
