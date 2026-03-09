"use client";

import {
  Plus,
  Loader2,
  FileText,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  Globe,
  FileOutput,
  FileInput,
  Wand2,
  Table,
  ExternalLink,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconDisplay } from "@/components/ui/icon-picker";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSkillList, useCreateSkill, useUpdateSkill, useDeleteSkill } from "@/orpc/hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommunitySkill = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
  logoUrl?: string;
  category: "automation" | "documents" | "utilities" | "industry";
  enabled: boolean;
};

// ─── Community skills mock data ───────────────────────────────────────────────

const COMMUNITY_SKILLS: CommunitySkill[] = [
  {
    id: "agent-browser",
    slug: "agent-browser",
    displayName: "Agent Browser",
    description:
      "Browse the web autonomously — search, navigate, extract data, and interact with pages on behalf of the user.",
    icon: <Globe className="h-5 w-5" />,
    category: "automation",
    enabled: true,
  },
  {
    id: "fill-pdf",
    slug: "fill-pdf",
    displayName: "Fill PDF",
    description:
      "Fill PDF form fields programmatically from structured data. Supports text fields, checkboxes, and dropdowns.",
    icon: <FileInput className="h-5 w-5" />,
    category: "documents",
    enabled: true,
  },
  {
    id: "docx",
    slug: "docx",
    displayName: "Docx",
    description:
      "Generate polished Word documents from templates or scratch — headings, tables, images, and custom styles.",
    icon: <FileOutput className="h-5 w-5" />,
    logoUrl: "/integrations/google-docs.svg",
    category: "documents",
    enabled: true,
  },
  {
    id: "xlsx",
    slug: "xlsx",
    displayName: "Xlsx",
    description:
      "Create and manipulate Excel spreadsheets — multiple sheets, formulas, conditional formatting, and charts.",
    icon: <Table className="h-5 w-5" />,
    logoUrl: "/integrations/google-sheets.svg",
    category: "documents",
    enabled: false,
  },
  {
    id: "skill-creator",
    slug: "skill-creator",
    displayName: "Skill Creator",
    description:
      "Describe what you need in plain language and this skill generates a fully functional new skill with instructions and files.",
    icon: <Wand2 className="h-5 w-5" />,
    category: "utilities",
    enabled: true,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  automation: "Automation",
  documents: "Documents",
  utilities: "Utilities",
  industry: "Industry",
};

const CARD_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;

const FADE_IN_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function CommunitySkillCard({ skill }: { skill: CommunitySkill }) {
  const [enabled, setEnabled] = useState(skill.enabled);
  const handleCardActionClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <motion.div
      layout
      initial={CARD_MOTION.initial}
      animate={CARD_MOTION.animate}
      exit={CARD_MOTION.exit}
      transition={CARD_MOTION.transition}
    >
      <Link
        href={`/skills/community/${skill.id}`}
        className={cn(
          "border-border/40 bg-card hover:border-border/80 hover:bg-muted/20 group relative flex h-full min-h-[180px] w-full flex-col rounded-xl border p-5 shadow-sm transition-all duration-200",
        )}
      >
        {/* Header: icon + toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "bg-muted/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                enabled ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {skill.logoUrl ? (
                <Image
                  src={skill.logoUrl}
                  alt={skill.displayName}
                  width={22}
                  height={22}
                  className="size-[22px]"
                />
              ) : (
                skill.icon
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] leading-tight font-medium">{skill.displayName}</p>
              <span className="text-muted-foreground mt-0.5 block text-[10px] font-medium tracking-wider uppercase">
                {CATEGORY_LABELS[skill.category]}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5" onClick={handleCardActionClick}>
            <label className="flex cursor-pointer items-center gap-1.5">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-muted-foreground w-6 text-[11px]">
                {enabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
          {skill.description}
        </p>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            Community
          </span>
          <ExternalLink className="text-muted-foreground/30 group-hover:text-muted-foreground size-3.5 transition-colors" />
        </div>
      </Link>
    </motion.div>
  );
}

function CustomSkillCard({
  skill,
  onToggle,
  onDelete,
}: {
  skill: {
    id: string;
    name: string;
    displayName: string;
    description: string;
    icon: string | null;
    enabled: boolean;
  };
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string, displayName: string) => Promise<void>;
}) {
  const handleToggle = useCallback(
    (value: boolean) => {
      void onToggle(skill.id, value);
    },
    [onToggle, skill.id],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void onDelete(skill.id, skill.displayName);
    },
    [onDelete, skill.id, skill.displayName],
  );
  const handleCardActionClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <motion.div
      layout
      initial={CARD_MOTION.initial}
      animate={CARD_MOTION.animate}
      exit={CARD_MOTION.exit}
      transition={CARD_MOTION.transition}
    >
      <Link
        href={`/skills/${skill.id}`}
        className={cn(
          "border-border/40 bg-card hover:border-border/80 hover:bg-muted/20 group relative flex h-full min-h-[180px] w-full flex-col rounded-xl border p-5 shadow-sm transition-all duration-200",
        )}
      >
        {/* Header: icon + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-muted/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <IconDisplay icon={skill.icon} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] leading-tight font-medium">{skill.displayName}</p>
              <span className="text-muted-foreground font-mono text-[10px]">{skill.name}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1" onClick={handleCardActionClick}>
            <label className="flex cursor-pointer items-center gap-1.5">
              <Switch checked={skill.enabled} onCheckedChange={handleToggle} />
              <span className="text-muted-foreground w-6 text-[11px]">
                {skill.enabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
          {skill.description}
        </p>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            Custom
          </span>
          <div className="flex items-center gap-0.5" onClick={handleCardActionClick}>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link href={`/skills/${skill.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive h-7 w-7"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function SkillsPageContent() {
  const router = useRouter();
  const { data: skills, isLoading, refetch } = useSkillList();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const result = await createSkill.mutateAsync({
        displayName: "New Skill",
        description: "Add a description for this skill",
      });
      router.push(`/skills/${result.id}`);
    } catch {
      setNotification({
        type: "error",
        message: "Failed to create skill. Please try again.",
      });
      setIsCreating(false);
    }
  }, [createSkill, router]);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await updateSkill.mutateAsync({ id, enabled });
        refetch();
      } catch (error) {
        console.error("Failed to toggle skill:", error);
      }
    },
    [refetch, updateSkill],
  );

  const handleDelete = useCallback(
    async (id: string, displayName: string) => {
      if (!confirm(`Are you sure you want to delete "${displayName}"?`)) {
        return;
      }

      try {
        await deleteSkill.mutateAsync(id);
        setNotification({
          type: "success",
          message: `Skill "${displayName}" deleted.`,
        });
        refetch();
      } catch {
        setNotification({
          type: "error",
          message: "Failed to delete skill.",
        });
      }
    },
    [deleteSkill, refetch],
  );

  useEffect(() => {
    if (!notification) {
      return;
    }
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  const skillsList = useMemo(() => (Array.isArray(skills) ? skills : []), [skills]);

  const q = search.toLowerCase().trim();

  const filteredCommunity = useMemo(() => {
    if (!q) {
      return COMMUNITY_SKILLS;
    }
    return COMMUNITY_SKILLS.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q),
    );
  }, [q]);

  const filteredCustom = useMemo(() => {
    if (!q) {
      return skillsList;
    }
    return skillsList.filter(
      (s) =>
        s.displayName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [q, skillsList]);
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">Skills</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Extend your agent with pre-built and custom capabilities
            </p>
          </div>
          <Button onClick={handleCreate} disabled={isCreating} className="self-start">
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Skill
          </Button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={cn(
            "mb-6 flex items-center gap-2 rounded-lg border p-4",
            notification.type === "success"
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {notification.message}
        </div>
      )}

      {/* Search */}
      <div className="border-border/50 bg-card mb-8 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm">
        <Search className="text-muted-foreground/50 size-4 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search skills…"
          className="placeholder:text-muted-foreground/40 w-full bg-transparent text-sm outline-none"
        />
      </div>

      {/* My Skills */}
      <section className="mb-12">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">My Skills</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Custom skills you&apos;ve created
            </p>
          </div>
          {!isLoading && (
            <p className="text-muted-foreground text-xs">
              {filteredCustom.length} skill{filteredCustom.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredCustom.length === 0 && !q ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <FileText className="text-muted-foreground/50 mx-auto h-12 w-12" />
            <h3 className="mt-4 text-lg font-medium">No custom skills yet</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Create your first skill to teach the AI agent new capabilities.
            </p>
            <Button className="mt-4" onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Skill
            </Button>
          </div>
        ) : filteredCustom.length === 0 && q ? (
          <motion.div
            initial={FADE_IN_MOTION.initial}
            animate={FADE_IN_MOTION.animate}
            className="py-12 text-center"
          >
            <p className="text-muted-foreground text-sm">No custom skills match your search.</p>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filteredCustom.map((skill) => (
                <CustomSkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* Community Skills */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Community Skills</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Pre-built skills ready to activate
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            {filteredCommunity.length} skill{filteredCommunity.length !== 1 ? "s" : ""}
          </p>
        </div>
        <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredCommunity.map((skill) => (
              <CommunitySkillCard key={skill.id} skill={skill} />
            ))}
          </AnimatePresence>
        </motion.div>
        {filteredCommunity.length === 0 && (
          <motion.div
            initial={FADE_IN_MOTION.initial}
            animate={FADE_IN_MOTION.animate}
            className="py-12 text-center"
          >
            <p className="text-muted-foreground text-sm">No community skills match your search.</p>
          </motion.div>
        )}
      </section>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  return (
    <Suspense fallback={skillsPageFallbackNode}>
      <SkillsPageContent />
    </Suspense>
  );
}

function SkillsPageFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

const skillsPageFallbackNode = <SkillsPageFallback />;
