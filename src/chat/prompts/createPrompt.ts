import { GuidanceLevel, StepDetailLevel } from '../GuidanceLevel';
import { getGuidanceLevelInstructions, getStepDetailInstructions } from './guidanceLevelPrompts';
import { WorkspaceContext, formatWorkspaceContext } from '../tools/WorkspaceAnalyzer';

export function buildCreatePrompt(
  userPrompt: string,
  level: GuidanceLevel = 'balanced',
  stepDetailLevel: StepDetailLevel = 'standard',
  workspaceContext?: WorkspaceContext
): string {
  const workspaceSection = workspaceContext ? `\n${formatWorkspaceContext(workspaceContext)}\n` : '';

  return `Create a hierarchical plan for the following request.

${getGuidanceLevelInstructions(level)}

${getStepDetailInstructions(stepDetailLevel)}

${workspaceSection}
User request: ${userPrompt}

Generate the complete plan as a JSON array of PlanFileSpec objects.`;
}
