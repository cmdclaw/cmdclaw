import { AnimatedHowItWorksSection } from "@/components/landing/animated-how-it-works";
import { TeamShowcaseSection } from "@/components/landing/team-showcase";

export default function ReadmePreviewPage() {
  return (
    <main className="bg-background min-h-screen">
      <div id="readme-preview-how-it-works">
        <AnimatedHowItWorksSection />
      </div>
      <div id="readme-preview-inbox">
        <TeamShowcaseSection />
      </div>
    </main>
  );
}
