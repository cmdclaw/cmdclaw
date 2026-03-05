import type { ComponentType } from "react";
import {
  Blocks,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Gauge,
  Image,
  LayoutTemplate,
  Mail,
  Mic,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { DM_Sans, Playfair_Display } from "next/font/google";
import Link from "next/link";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
});

type QuickAction = {
  icon: ComponentType<{ className?: string }>;
  label: string;
};

type TemplateCard = {
  title: string;
  creator: string;
  runs: string;
  likes: string;
  cost: string;
  previewClassName: string;
};

const quickActions: QuickAction[] = [
  { icon: Mail, label: "Contact Form" },
  { icon: Image, label: "Image Editor" },
  { icon: Gamepad2, label: "Mini Game" },
  { icon: TrendingUp, label: "Finance Calculator" },
];

const templateCards: TemplateCard[] = [
  {
    title: "Nano Banana Pro Playground",
    creator: "NB",
    runs: "4.9K",
    likes: "587",
    cost: "Free",
    previewClassName:
      "bg-[radial-gradient(circle_at_20%_30%,rgba(255,212,120,0.45),transparent_55%),linear-gradient(145deg,#040404,#131313_42%,#1c3d3f)]",
  },
  {
    title: "Brillance SaaS Landing Page",
    creator: "BL",
    runs: "11.2K",
    likes: "1.7K",
    cost: "Free",
    previewClassName:
      "bg-[linear-gradient(180deg,#fbfaf7_0%,#f3eee4_55%,#ece2d4_100%)] text-zinc-900",
  },
  {
    title: "3D Gallery Photography Template",
    creator: "HS",
    runs: "2.9K",
    likes: "734",
    cost: "1 Credit",
    previewClassName:
      "bg-[radial-gradient(circle_at_70%_75%,rgba(230,230,230,0.16),transparent_38%),linear-gradient(160deg,#010101,#101010_52%,#050505)]",
  },
  {
    title: "Command Center UI Kit",
    creator: "CC",
    runs: "8.6K",
    likes: "1.2K",
    cost: "Free",
    previewClassName:
      "bg-[radial-gradient(circle_at_16%_18%,rgba(94,234,212,0.35),transparent_38%),linear-gradient(130deg,#0d1f27,#1f4e53)]",
  },
  {
    title: "SaaS Analytics Console",
    creator: "AN",
    runs: "7.1K",
    likes: "802",
    cost: "Free",
    previewClassName:
      "bg-[radial-gradient(circle_at_80%_20%,rgba(253,224,71,0.4),transparent_30%),linear-gradient(120deg,#171717,#2f2f2f_65%,#3f3f46)]",
  },
  {
    title: "Dark Product Reveal Grid",
    creator: "DR",
    runs: "5.3K",
    likes: "690",
    cost: "1 Credit",
    previewClassName:
      "bg-[radial-gradient(circle_at_25%_75%,rgba(148,163,184,0.35),transparent_42%),linear-gradient(132deg,#05080e,#111827_45%,#0f172a)]",
  },
];

const templateCategories = ["Apps and Games", "Landing Pages", "Components", "Dashboards"];

export function WorkflowLanding() {
  return (
    <div
      className={`${dmSans.variable} ${playfairDisplay.variable} min-h-screen bg-[#ececeb] [font-family:var(--font-dm-sans)] text-zinc-900`}
    >
      <div className="mx-auto max-w-7xl px-6 pt-24 pb-20 sm:px-10 lg:px-16">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center">
          <h1 className="text-center text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            What do you want to create?
          </h1>

          <Link
            href="/chat"
            className="mt-8 block w-full rounded-2xl border border-zinc-300/90 bg-white/60 px-5 pt-4 pb-3 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition duration-300 hover:bg-white"
          >
            <p className="text-lg text-zinc-500">Ask v0 to build...</p>
            <div className="mt-16 flex items-center justify-between text-zinc-600">
              <span className="inline-flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                v0 Max
                <ChevronDown className="h-4 w-4" />
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
                <Mic className="h-4 w-4" />
              </span>
            </div>
          </Link>

          <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
            {quickActions.map(({ icon: Icon, label }) => (
              <Link
                key={label}
                href="/chat"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-[#efefee] px-4 py-2 text-sm text-zinc-600 transition duration-300 hover:border-zinc-400 hover:text-zinc-800"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              href="/chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-[#efefee] text-zinc-600 transition duration-300 hover:border-zinc-400 hover:text-zinc-800"
              aria-label="Refresh ideas"
            >
              <RefreshCcw className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-28">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Start with a template
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {templateCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-[#efefee] px-4 py-2 text-sm text-zinc-700"
                >
                  {category === "Apps and Games" ? <Gamepad2 className="h-4 w-4" /> : null}
                  {category === "Landing Pages" ? <LayoutTemplate className="h-4 w-4" /> : null}
                  {category === "Components" ? <Blocks className="h-4 w-4" /> : null}
                  {category === "Dashboards" ? <Gauge className="h-4 w-4" /> : null}
                  {category}
                </button>
              ))}
              <Link
                href="/chat"
                className="inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-zinc-900"
              >
                Browse all
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {templateCards.map((template) => (
              <Link
                key={template.title}
                href="/chat"
                className="group rounded-2xl border border-zinc-300/80 bg-white/55 p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(15,23,42,0.1)]"
              >
                <div
                  className={`relative h-52 overflow-hidden rounded-xl border border-zinc-200/70 ${template.previewClassName}`}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.16),transparent)] opacity-0 transition duration-300 group-hover:opacity-100" />
                  <div className="absolute right-4 bottom-4 left-4 text-white">
                    <p className="[font-family:var(--font-playfair-display)] text-2xl leading-tight">
                      {template.title.split(" ").slice(0, 3).join(" ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                      {template.creator}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-zinc-900">
                        {template.title}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-zinc-500">
                        <Users className="h-3.5 w-3.5" />
                        {template.runs}
                        <span className="mx-1">·</span>
                        {template.likes} likes
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm text-zinc-500">{template.cost}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
