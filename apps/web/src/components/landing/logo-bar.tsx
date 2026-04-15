"use client";

import { motion } from "motion/react";

const LOGOS = [
  { name: "Ramp", svg: "M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" },
  {
    name: "Gusto",
    svg: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z",
  },
] as const;

export function LogoBar() {
  return (
    <section className="border-border/40 bg-background border-t px-6 py-10 md:py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
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
