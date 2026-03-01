import { z } from 'zod';
import matter from 'gray-matter';
import { FrontmatterSchema } from '../parser/FrontmatterSchema';

export const PlanFileSpecSchema = z.object({
  relativePath: z.string(),
  frontmatter: FrontmatterSchema,
  body: z.string(),
});

export type PlanFileSpec = z.infer<typeof PlanFileSpecSchema>;

export const PlanFileSpecArraySchema = z.array(PlanFileSpecSchema);

export interface UnfoldChatResultMetadata {
  command: string;
  filesWritten: string[];
  planRootId?: string;
  /** Set when the response was a clarification question, not a plan generation */
  awaitingClarification?: boolean;
}

const DELIMITER_REGEX = /^===\s*FILE:\s*(.+?)\s*===$/;

/**
 * Parses LLM output into PlanFileSpec[].
 * Expects delimiter-based format where each file is separated by `=== FILE: <relativePath> ===`.
 * Each file block contains YAML frontmatter followed by markdown body.
 */
export function parseGeneratedPlan(llmOutput: string): PlanFileSpec[] {
  const cleaned = llmOutput.trim();
  const result: PlanFileSpec[] = [];

  // Split on delimiter, keeping the delimiter in the result for path extraction
  const parts = cleaned.split(/===\s*FILE:\s*/);

  // First part should be empty (before first delimiter) or contain non-delimiter text
  let startIndex = 0;
  if (parts.length > 0 && !parts[0].trim().match(/^===?\s*/)) {
    // If first part doesn't start with a delimiter-like pattern, skip it
    startIndex = 1;
  }

  for (let i = startIndex; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Extract relativePath from the beginning (e.g., "plan.md ===")
    const pathMatch = part.match(/^([^\n=]+?)\s*===\s*\n([\s\S]*)$/);
    if (!pathMatch) {
      throw new Error(
        `Failed to parse file delimiter at part ${i}.\n` +
        `Expected format: "=== FILE: <path> ===" followed by file content.\n` +
        `Got: "${part.slice(0, 100)}..."`
      );
    }

    const relativePath = pathMatch[1].trim();
    const fileContent = pathMatch[2].trim();

    // Parse YAML frontmatter with gray-matter
    const parsed = matter(fileContent);
    const frontmatterRaw = parsed.data;
    const body = parsed.content;

    // Validate frontmatter against schema
    let frontmatter;
    try {
      frontmatter = FrontmatterSchema.parse(frontmatterRaw);
    } catch (e) {
      const error = e as Error;
      throw new Error(
        `Failed to validate frontmatter for file "${relativePath}".\n` +
        `Validation error: ${error.message}\n` +
        `Frontmatter data: ${JSON.stringify(frontmatterRaw, null, 2)}`
      );
    }

    // Build the PlanFileSpec
    const spec: PlanFileSpec = {
      relativePath,
      frontmatter,
      body,
    };

    // Validate the full spec
    try {
      result.push(PlanFileSpecSchema.parse(spec));
    } catch (e) {
      const error = e as Error;
      throw new Error(
        `Failed to validate PlanFileSpec for file "${relativePath}".\n` +
        `Validation error: ${error.message}`
      );
    }
  }

  if (result.length === 0) {
    throw new Error(
      `No files found in LLM output.\n\n` +
      `Expected delimiter format: === FILE: <path> ===\n\n` +
      `First 500 chars of output:\n${cleaned.slice(0, 500)}`
    );
  }

  return result;
}
