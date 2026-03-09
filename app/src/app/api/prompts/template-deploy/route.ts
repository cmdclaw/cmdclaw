import { readFile } from "node:fs/promises";
import path from "node:path";

const TEMPLATE_DEPLOY_PROMPT_PATH = path.join(process.cwd(), "prompts", "template-deploy.txt");

export async function GET() {
  try {
    const prompt = await readFile(TEMPLATE_DEPLOY_PROMPT_PATH, "utf8");

    return new Response(prompt, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to load template deploy prompt:", error);
    return new Response("Failed to load template deploy prompt", { status: 500 });
  }
}
