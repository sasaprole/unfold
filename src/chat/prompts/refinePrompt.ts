import { GuidanceLevel, StepDetailLevel } from '../GuidanceLevel';
import { getGuidanceLevelInstructions, getStepDetailInstructions } from './guidanceLevelPrompts';
import { WorkspaceContext, formatWorkspaceContext } from '../tools/WorkspaceAnalyzer';

export function buildRefinePrompt(
  planSummary: string,
  userRequest: string,
  level: GuidanceLevel = 'balanced',
  stepDetailLevel: StepDetailLevel = 'standard',
  workspaceContext?: WorkspaceContext
): string {
  const workspaceSection = workspaceContext ? `\n${formatWorkspaceContext(workspaceContext)}\n` : '';

  return `You are refining an existing Unfold plan. Here is the current plan structure:

${planSummary}

The user wants to make the following changes:
${userRequest}

${getGuidanceLevelInstructions(level)}

${getStepDetailInstructions(stepDetailLevel)}

${workspaceSection}
Generate ONLY the new or modified files using the file format above.
- For modified files: use the same id and update the content
- For new files: create new entries with unique IDs and correct parent references
- Do NOT include unchanged files
- Ensure new nodes have correct parent references to existing IDs in the plan`;
}
