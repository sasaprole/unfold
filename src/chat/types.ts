import { z } from 'zod';
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

/**
 * Parses LLM output into PlanFileSpec[].
 * Strips code fences, extracts JSON from mixed output, and validates against the schema.
 */
export function parseGeneratedPlan(llmOutput: string): PlanFileSpec[] {
  let cleaned = llmOutput.trim();

  // Try to extract content from markdown code fences that wrap a JSON array.
  // Only accept fence content that actually looks like JSON (starts with '[').
  // This avoids matching code fences inside body string values (e.g. ```csharp blocks).
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    const fenceContent = fenceMatch[1].trim();
    if (fenceContent.startsWith('[')) {
      cleaned = fenceContent;
    }
    // If fence content doesn't start with '[', ignore it — it's an inner code block
  }

  // If we don't already have a JSON array, find one by bracket matching
  if (!cleaned.startsWith('[')) {
    const arrayStart = cleaned.indexOf('[');
    if (arrayStart !== -1) {
      // Find the matching closing bracket
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let arrayEnd = -1;

      for (let i = arrayStart; i < cleaned.length; i++) {
        const char = cleaned[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '[' || char === '{') {
            depth++;
          } else if (char === ']' || char === '}') {
            depth--;
            if (depth === 0) {
              arrayEnd = i + 1;
              break;
            }
          }
        }
      }

      if (arrayEnd !== -1) {
        cleaned = cleaned.slice(arrayStart, arrayEnd);
      }
    }
  }

  // If we still don't have valid-looking content, fail fast with diagnostic info
  if (!cleaned.startsWith('[')) {
    const fenceInfo = fenceMatch
      ? `Code fence was found but content starts with '${fenceMatch[1].trim().slice(0, 30)}...' (not a JSON array — likely an inner code block from body content)`
      : 'No code fences found in output';
    const bracketIndex = llmOutput.indexOf('[');
    const bracketInfo = bracketIndex !== -1
      ? `First '[' at index ${bracketIndex}, context: '${llmOutput.slice(Math.max(0, bracketIndex - 20), bracketIndex + 30).replace(/\n/g, '\\n')}'`
      : 'No \'[\' character found in output at all';
    throw new Error(
      `Failed to find JSON array in LLM output.\n\n` +
      `Diagnostics:\n` +
      `- Output length: ${llmOutput.length} chars\n` +
      `- ${fenceInfo}\n` +
      `- ${bracketInfo}\n` +
      `- Cleaned starts with: '${cleaned.slice(0, 50).replace(/\n/g, '\\n')}'\n\n` +
      `First 500 chars of raw output:\n${llmOutput.slice(0, 500)}`
    );
  }

  // LLMs often generate JSON with literal newlines in string values instead of \n
  // Try to fix common JSON escaping issues
  const fixed = tryFixJsonEscaping(cleaned);

  let parsed;
  try {
    parsed = JSON.parse(fixed);
  } catch (e) {
    const error = e as Error;
    // Find approximate position of the parse error
    const posMatch = error.message.match(/position\s+(\d+)/i);
    let posContext = '';
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      posContext = `\n- Error near position ${pos}: '${fixed.slice(Math.max(0, pos - 40), pos + 40).replace(/\n/g, '\\n')}'`;
    }
    throw new Error(
      `Failed to parse generated plan as JSON.\n\n` +
      `Parse error: ${error.message}\n` +
      `Diagnostics:\n` +
      `- Cleaned length: ${cleaned.length}, Fixed length: ${fixed.length}\n` +
      `- Lengths differ: ${cleaned.length !== fixed.length} (escaping was ${cleaned.length !== fixed.length ? 'applied' : 'not needed'})` +
      posContext +
      `\n\nFirst 500 chars of cleaned output:\n${cleaned.slice(0, 500)}`
    );
  }

  try {
    return PlanFileSpecArraySchema.parse(parsed);
  } catch (e) {
    const error = e as Error;
    throw new Error(
      `JSON parsed successfully but failed Zod schema validation.\n\n` +
      `Validation error: ${error.message}\n` +
      `Parsed ${Array.isArray(parsed) ? parsed.length : 0} items. ` +
      `First item keys: ${Array.isArray(parsed) && parsed[0] ? Object.keys(parsed[0]).join(', ') : 'N/A'}`
    );
  }
}

/**
 * Attempts to fix common JSON escaping issues in LLM output.
 * The main issue is literal newlines in string values instead of \n escape sequences.
 */
function tryFixJsonEscaping(json: string): string {
  try {
    // First, try parsing as-is - if it works, no fix needed
    JSON.parse(json);
    return json;
  } catch {
    // Parsing failed, try to fix common issues
  }

  // Strategy: find string values and properly escape their content
  // We'll process the JSON character by character, tracking when we're inside strings
  let result = '';
  let inString = false;
  let escapeNext = false;
  let stringStart = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    const prevChar = i > 0 ? json[i - 1] : '';

    if (!inString) {
      // Track structural depth (only outside strings)
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;
    }

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      if (!inString) {
        // Starting a string
        inString = true;
        stringStart = i;
        result += char;
      } else {
        // Ending a string - check if we had literal newlines inside
        const stringContent = json.slice(stringStart + 1, i);
        if (stringContent.includes('\n') || stringContent.includes('\r')) {
          // This string had literal newlines - we need to rebuild it with proper escaping
          // Remove the string we've built so far and rebuild it properly
          result = result.slice(0, result.length - (i - stringStart));
          // Escape the string content properly
          const escaped = json.slice(stringStart + 1, i)
            .replace(/\r\n/g, '\\n')  // Windows line endings
            .replace(/\n/g, '\\n')    // Escape literal newlines
            .replace(/\r/g, '\\r')    // Escape carriage returns
            .replace(/\t/g, '\\t');   // Escape tabs
          result += '"' + escaped + '"';
        } else {
          result += char;
        }
        inString = false;
      }
    } else if (inString) {
      result += char;
    } else {
      result += char;
    }
  }

  return result;
}
