import * as vscode from 'vscode';
import * as path from 'path';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { buildRefinePrompt } from '../prompts/refinePrompt';
import { parseGeneratedPlan, PlanFileSpec, UnfoldChatResultMetadata } from '../types';
import { writePlanFiles } from '../PlanFileWriter';
import { PlanReader } from '../PlanReader';
import { getGuidanceLevel, getStepDetailLevel, shouldAskClarifications } from '../GuidanceLevel';
import { hasPendingClarification, sendClarificationRequest } from '../clarificationFlow';
import { WorkspaceAnalyzer } from '../tools/WorkspaceAnalyzer';
import { getUnfoldTools } from '../tools/UnfoldTools';
import { discoverExternalTools } from '../tools/externalTools';
import { sendRequestWithTools } from '../tools/ToolCallLoop';

export async function handleRefine(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<UnfoldChatResultMetadata> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    stream.markdown('Please open a workspace folder first so I can write plan files.');
    return { command: 'refine', filesWritten: [] };
  }

  if (!request.prompt.trim()) {
    stream.markdown('Please describe how you want to refine the plan. For example:\n\n`@unfold /refine Add database migration steps`');
    return { command: 'refine', filesWritten: [] };
  }

  const reader = new PlanReader();
  const workspaceRoot = workspaceFolder.uri.fsPath;

  stream.progress('Reading existing plan...');
  const planSummary = await reader.getPlanSummary(workspaceRoot);

  if (planSummary === '(no existing plan found)') {
    stream.markdown('No existing plan found in the workspace. Use `/create` to generate a new plan first.');
    return { command: 'refine', filesWritten: [] };
  }

  const level = getGuidanceLevel();
  const stepDetailLevel = getStepDetailLevel();
  const askFirst = shouldAskClarifications();

  // Gather workspace context early (needed for clarifications)
  stream.progress('Analyzing workspace...');
  let workspaceContext;
  try {
    const analyzer = new WorkspaceAnalyzer();
    workspaceContext = await analyzer.analyze(workspaceRoot);
  } catch {
    // Continue without workspace context if analysis fails
  }

  // If clarification is enabled and we haven't asked yet, ask first
  if (askFirst && !hasPendingClarification(chatContext, 'refine')) {
    return sendClarificationRequest(request, stream, token, level, 'refine', planSummary, workspaceContext);
  }

  stream.progress('Refining plan...');

  const userRequest = buildFullPromptFromHistory(chatContext, request.prompt, 'refine');

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(buildRefinePrompt(planSummary, userRequest, level, stepDetailLevel, workspaceContext)),
  ];

  // Gather tools
  const unfoldTools = getUnfoldTools();
  const externalTools = discoverExternalTools();
  const allTools = [
    ...unfoldTools.map(t => t.tool),
    ...externalTools,
  ];
  const executors = new Map(unfoldTools.map(t => [t.tool.name, t.execute]));

  const llmOutput = await sendRequestWithTools(messages, allTools, executors, request, stream, token);
  if (llmOutput === null) {
    return { command: 'refine', filesWritten: [] };
  }

  let specs: PlanFileSpec[];
  try {
    specs = parseGeneratedPlan(llmOutput);
  } catch (err) {
    stream.markdown('Failed to parse the refined plan. Raw output:\n\n```\n' + llmOutput + '\n```\n\nError: ' + String(err));
    return { command: 'refine', filesWritten: [] };
  }

  if (token.isCancellationRequested) {
    return { command: 'refine', filesWritten: [] };
  }

  // For existing IDs, overwrite at their current paths
  const idToPath = await reader.getIdToPathMap(workspaceRoot);
  for (const spec of specs) {
    const existingPath = idToPath.get(spec.frontmatter.id);
    if (existingPath) {
      spec.relativePath = path.relative(workspaceRoot, existingPath);
    }
  }

  const writtenPaths = await writePlanFiles(specs, workspaceRoot);

  const modified = specs.filter(s => idToPath.has(s.frontmatter.id));
  const added = specs.filter(s => !idToPath.has(s.frontmatter.id));

  stream.markdown(`Plan refined - **${writtenPaths.length}** files written:\n\n`);
  if (modified.length > 0) {
    stream.markdown(`**Modified (${modified.length}):**\n`);
    for (const spec of modified) {
      stream.markdown(`- \`${spec.relativePath}\` - ${spec.frontmatter.title}\n`);
    }
  }
  if (added.length > 0) {
    stream.markdown(`**Added (${added.length}):**\n`);
    for (const spec of added) {
      stream.markdown(`- \`${spec.relativePath}\` - ${spec.frontmatter.title}\n`);
    }
  }

  stream.button({
    command: 'unfold.refreshTree',
    title: 'Refresh Plan Tree',
  });

  return { command: 'refine', filesWritten: writtenPaths };
}

function buildFullPromptFromHistory(
  chatContext: vscode.ChatContext,
  currentPrompt: string,
  command: string
): string {
  const parts: string[] = [];

  for (const turn of chatContext.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      if (turn.command === command || !turn.command) {
        parts.push(turn.prompt);
      }
    }
  }

  parts.push(currentPrompt);
  return parts.join('\n\n');
}
