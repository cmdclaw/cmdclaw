import type { TemplateContent } from "@/lib/template-data";

export type TemplateDeployPayload = {
  createPayload: {
    name: string;
    triggerType: TemplateContent["triggerType"];
    prompt: string;
  };
  initialBuilderMessage: string;
};

function replacePlaceholder(template: string, placeholder: string, value: string) {
  return template.replaceAll(`{{${placeholder}}}`, value);
}

export function buildTemplateInstructionsText(template: TemplateContent) {
  return template.agentInstructions.join("\n");
}

export function renderTemplateDeployPrompt(templateSource: string, template: TemplateContent) {
  const instructions = buildTemplateInstructionsText(template);

  return replacePlaceholder(
    replacePlaceholder(
      replacePlaceholder(
        replacePlaceholder(templateSource, "name", template.title),
        "trigger_title",
        template.triggerTitle,
      ),
      "trigger_description",
      template.triggerDescription,
    ),
    "instructions",
    instructions,
  );
}

export function buildTemplateDeployPayload(
  template: TemplateContent,
  templateSource: string,
): TemplateDeployPayload {
  return {
    createPayload: {
      name: template.title,
      triggerType: template.triggerType,
      prompt: buildTemplateInstructionsText(template),
    },
    initialBuilderMessage: renderTemplateDeployPrompt(templateSource, template),
  };
}
