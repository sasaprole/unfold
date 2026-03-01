import { GuidanceLevel, StepDetailLevel } from '../GuidanceLevel';
import { WorkspaceContext, formatWorkspaceContext } from '../tools/WorkspaceAnalyzer';

/**
 * Returns prompt instructions that adapt plan generation to the chosen guidance level.
 * Controls the breadth and depth of the plan hierarchy (how many steps, how broad).
 */
export function getGuidanceLevelInstructions(level: GuidanceLevel): string {
  switch (level) {
    case 'precise':
      return `IMPORTANT CONSTRAINTS:
- Generate ONLY what the user explicitly requested. Do not invent, infer, or add steps they did not mention.
- Keep the hierarchy shallow — use 1-2 levels unless the user's description clearly warrants more.
- Do not suggest alternatives, edge cases, or "nice-to-haves".
- If the user says "build an API with auth", create exactly those two nodes under a root — nothing else.`;

    case 'guided':
      return `IMPORTANT CONSTRAINTS:
- Start with what the user explicitly requested.
- You may add a small number of steps the user likely needs but didn't mention (e.g. setup, config, testing) — but keep it minimal and clearly relevant.
- Use 2-3 levels of hierarchy.
- Do not go on tangents or add speculative features. Stick close to the user's intent.`;

    case 'balanced':
      return `Decompose the plan into 3-4 levels of detail:
- Level 1: A single root node representing the overall project/goal
- Level 2: Major phases or workflows (3-6 items)
- Level 3: Specific tasks within each phase (2-5 per phase)
- Level 4: Implementation details or code-level steps where appropriate (1-3 per task)`;

    case 'creative':
      return `Create a thorough, deeply detailed plan. Go beyond what the user stated:
- Use 4+ levels of hierarchy where appropriate.
- Suggest additional phases the user may not have considered (testing strategies, error handling, monitoring, edge cases, UX considerations).
- Propose alternatives or trade-offs in node bodies where relevant.
- This is a brainstorming/exploration mode — be thorough in considering implications.`;
  }
}

/**
 * Returns prompt instructions for how detailed each step's content should be.
 * This is independent of plan breadth — you can have a narrow plan with highly detailed steps.
 */
export function getStepDetailInstructions(level: StepDetailLevel): string {
  switch (level) {
    case 'concise':
      return `STEP DETAIL LEVEL (concise):
- Write 1-2 sentences per step.
- Focus on WHAT needs to be done and WHY.
- Avoid implementation details unless critical for understanding.
- Keep descriptions punchy and scannable.`;

    case 'standard':
      return `STEP DETAIL LEVEL (standard):
- Write 2-3 sentences per step.
- Cover the main points: what, why, and key considerations.
- Include high-level approach without going into implementation specifics.
- Provide enough detail for a developer to understand the scope.`;

    case 'detailed':
      return `STEP DETAIL LEVEL (detailed):
- Write 3-5 sentences per step.
- Include specific approaches, patterns, or methodologies to use.
- Mention key files, functions, or components that will be affected.
- Note important considerations, dependencies, or edge cases.`;

    case 'comprehensive':
      return `STEP DETAIL LEVEL (comprehensive):
- Write highly detailed step descriptions.
- Include code snippets, example file paths, specific function names.
- Cover edge cases, error handling, validation, and testing approaches.
- Provide implementation guidance that a developer could follow directly.
- Include rationale for technical decisions and alternatives considered.`;
  }
}

/**
 * Returns prompt instructions for the clarification phase.
 */
export function getClarificationPrompt(
  userPrompt: string,
  level: GuidanceLevel,
  planContext?: string,
  workspaceContext?: WorkspaceContext
): string {
  const levelHint = level === 'precise'
    ? 'The user wants a precise, literal plan. Ask only what is strictly necessary to avoid ambiguity.'
    : level === 'guided'
      ? 'The user wants a focused plan with minor suggestions. Ask about anything unclear and whether common related concerns apply.'
      : level === 'balanced'
        ? 'Ask about scope, priorities, and any areas that seem underspecified.'
        : 'The user is in exploration mode. Ask broad questions about goals, constraints, alternatives, and anything that could shape the plan.';

  const planContextBlock = planContext
    ? `\n\nExisting plan context:\n${planContext}`
    : '';

  const workspaceBlock = workspaceContext
    ? `\n\nCurrent workspace context:\n${formatWorkspaceContext(workspaceContext)}\n`
    : '';

  return `Before generating a plan, ask the user a few clarifying questions to make sure you understand their intent.

${levelHint}

${workspaceBlock ? 'Use the workspace context above to ask relevant questions about the current codebase, tech stack, and project structure.' : ''}

Rules:
- Ask 2-5 concise questions (fewer for precise mode, more for creative mode).
- Use a numbered list.
- Do NOT generate any plan files or JSON yet.
- End with: "Once you answer these, I'll generate the plan."

User's request: ${userPrompt}${planContextBlock}${workspaceBlock}`;
}
