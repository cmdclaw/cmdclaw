export type TextSegment = { type: "text"; content: string };
export type BrandSegment = { type: "brand"; name: string; icon: string };
export type PromptSegment = TextSegment | BrandSegment;
