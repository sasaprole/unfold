import { GuidanceLevel, StepDetailLevel } from '../GuidanceLevel';
import { getGuidanceLevelInstructions, getStepDetailInstructions } from './guidanceLevelPrompts';

export function buildConvertPrompt(
  planText: string,
  level: GuidanceLevel = 'balanced',
  stepDetailLevel: StepDetailLevel = 'standard'
): string {
  return `Convert the following plan into the Unfold hierarchical format. The input may be:
- A Copilot-style plan (numbered steps with sub-steps)
- A Claude Code plan (## sections with bullet points)
- A plain text outline or TODO list
- Any structured or semi-structured plan text

Analyze the structure, infer hierarchy levels, and produce a well-organized Unfold plan.

${getGuidanceLevelInstructions(level)}

${getStepDetailInstructions(stepDetailLevel)}

Input plan:
${planText}

Generate the complete plan as a JSON array of PlanFileSpec objects.`;
}
