"use client";

import { motion, useMotionValue, useTransform, animate, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

function AnimatedStat({
  target,
  suffix = "",
  prefix = "",
  label,
  delay = 0,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  label: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const timer = setTimeout(() => {
      const controls = animate(motionValue, target, {
        duration: 1.5,
        ease: "easeOut",
      });
      return () => controls.stop();
    }, delay);
    return () => clearTimeout(timer);
  }, [isInView, target, motionValue, delay]);

  useEffect(() => {
    return rounded.on("change", (v) => setDisplay(v));
  }, [rounded]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: delay / 1000 }}
      className="text-center"
    >
      <p className="text-foreground text-5xl font-bold tracking-tighter md:text-6xl">
        {prefix}
        {display.toLocaleString()}
        {suffix}
      </p>
      <p className="text-muted-foreground mt-2 text-sm">{label}</p>
    </motion.div>
  );
}

export function StatsSection() {
  return (
    <section className="border-border/40 bg-muted/30 border-t px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
        <AnimatedStat target={50} suffix="+" label="Teams using CmdClaw" delay={0} />
        <AnimatedStat target={10} suffix="K+" label="Tasks automated this month" delay={150} />
        <AnimatedStat target={99.9} suffix="%" label="Uptime SLA" delay={300} />
      </div>
    </section>
  );
}
