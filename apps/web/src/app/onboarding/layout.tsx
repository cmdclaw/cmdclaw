"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { StepIndicator } from "./_components/step-indicator";

const STEP_MAP: Record<string, number> = {
  "/onboarding/subscriptions": 1,
  "/onboarding/integrations": 2,
};

const MOTION_INITIAL = { opacity: 0, y: 12 };
const MOTION_ANIMATE = { opacity: 1, y: 0 };
const MOTION_TRANSITION = {
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStep = STEP_MAP[pathname ?? ""] ?? 1;

  return (
    <div className="bg-background flex min-h-screen flex-col px-4 pb-8">
      <div className="mx-auto w-full max-w-2xl pt-[max(1.5rem,8vh)] sm:pt-[12vh]">
        <StepIndicator current={currentStep} total={2} />
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <motion.div
          key={pathname}
          initial={MOTION_INITIAL}
          animate={MOTION_ANIMATE}
          transition={MOTION_TRANSITION}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
