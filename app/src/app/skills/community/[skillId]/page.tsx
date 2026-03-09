import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CommunitySkillDetailContent,
  COMMUNITY_SKILLS_DATA,
} from "@/components/community-skill-detail-content";

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ skillId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { skillId } = await params;
  const skill = COMMUNITY_SKILLS_DATA[skillId];
  if (!skill) {
    return { title: "Skill not found | CmdClaw" };
  }
  return {
    title: `${skill.title} | CmdClaw`,
    description: skill.description,
  };
}

export default async function CommunitySkillPage({ params }: PageProps) {
  const { skillId } = await params;
  const skill = COMMUNITY_SKILLS_DATA[skillId];

  if (!skill) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {/* ── Back link ── */}
      <Link
        href="/toolbox"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to Toolbox
      </Link>

      <CommunitySkillDetailContent skill={skill} />
    </div>
  );
}
