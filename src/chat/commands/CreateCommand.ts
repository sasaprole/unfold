import * as vscode from 'vscode';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { buildCreatePrompt } from '../prompts/createPrompt';
import { getClarificationPrompt } from '../prompts/guidanceLevelPrompts';
import { parseGeneratedPlan, UnfoldChatResultMetadata } from '../types';
import { writePlanFiles } from '../PlanFileWriter';
import { getGuidanceLevel, getStepDetailLevel, shouldAskClarifications } from '../GuidanceLevel';
import { hasPendingClarification, sendClarificationRequest } from '../clarificationFlow';
import { WorkspaceAnalyzer } from '../tools/WorkspaceAnalyzer';
import { getUnfoldTools } from '../tools/UnfoldTools';
import { discoverExternalTools } from '../tools/externalTools';
import { sendRequestWithTools } from '../tools/ToolCallLoop';

export async function handleCreate(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<UnfoldChatResultMetadata> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    stream.markdown('Please open a workspace folder first so I can write plan files.');
    return { command: 'create', filesWritten: [] };
  }

  if (!request.prompt.trim()) {
    stream.markdown('Please describe what you want to plan. For example:\n\n`@unfold /create Build a REST API with authentication and CRUD operations`');
    return { command: 'create', filesWritten: [] };
  }

  const level = getGuidanceLevel();
  const stepDetailLevel = getStepDetailLevel();
  const askFirst = shouldAskClarifications();

  // Gather workspace context early (needed for clarifications)
  stream.progress('Analyzing workspace...');
  const analyzer = new WorkspaceAnalyzer();
  const workspaceRoot = workspaceFolder.uri.fsPath;
  let workspaceContext;
  try {
    workspaceContext = await analyzer.analyze(workspaceRoot);
  } catch {
    // Continue without workspace context if analysis fails
  }

  // If clarification is enabled and we haven't asked yet in this conversation, ask first
  if (askFirst && !hasPendingClarification(chatContext, 'create')) {
    return sendClarificationRequest(request, stream, token, level, 'create', undefined, workspaceContext);
  }

  // Generate the plan
  stream.progress('Generating plan...');

  const userPrompt = buildFullPromptFromHistory(chatContext, request.prompt, 'create');

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(buildCreatePrompt(userPrompt, level, stepDetailLevel, workspaceContext)),
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
    return { command: 'create', filesWritten: [] };
  }

  let specs;
  try {
    specs = parseGeneratedPlan(llmOutput);
  } catch (err) {
    stream.markdown('Failed to parse the generated plan. Raw output:\n\n```\n' + llmOutput + '\n```\n\nError: ' + String(err));
    return { command: 'create', filesWritten: [] };
  }

  if (token.isCancellationRequested) {
    return { command: 'create', filesWritten: [] };
  }

  // Write new plans under .unfold/plans/<plan-id>/
  const rootSpec = specs.find(s => s.frontmatter.parent === '');
  const planId = rootSpec?.frontmatter.id || 'new-plan';
  specs = specs.map(s => ({
    ...s,
    relativePath: `.unfold/plans/${planId}/${s.relativePath}`,
  }));

  const writtenPaths = await writePlanFiles(specs, workspaceFolder.uri.fsPath);

  stream.markdown(`Plan created with **${writtenPaths.length}** files:\n\n`);
  for (const spec of specs) {
    stream.markdown(`- \`${spec.relativePath}\` - ${spec.frontmatter.title}\n`);
  }

  stream.button({
    command: 'unfold.refreshTree',
    title: 'Refresh Plan Tree',
  });

  return {
    command: 'create',
    filesWritten: writtenPaths,
    planRootId: specs.find(s => s.frontmatter.parent === '')?.frontmatter.id,
  };
}

/**
 * Combines the original request + clarification answers from chat history
 * into a single prompt for plan generation.
 */
function buildFullPromptFromHistory(
  chatContext: vscode.ChatContext,
  currentPrompt: string,
  command: string
): string {
  const history = chatContext.history;
  const parts: string[] = [];

  // Walk history looking for the original request and clarification answers
  for (const turn of history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      if (turn.command === command || !turn.command) {
        parts.push(turn.prompt);
      }
    }
  }

  parts.push(currentPrompt);
  return parts.join('\n\n');
}
