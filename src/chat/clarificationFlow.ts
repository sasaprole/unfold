import * as vscode from 'vscode';
import { GuidanceLevel } from './GuidanceLevel';
import { getClarificationPrompt } from './prompts/guidanceLevelPrompts';
import { UnfoldChatResultMetadata } from './types';
import { WorkspaceContext } from './tools/WorkspaceAnalyzer';

/**
 * Checks if the conversation already contains a clarification response
 * (i.e., the LLM already asked questions and the user is now answering).
 */
export function hasPendingClarification(
  chatContext: vscode.ChatContext,
  command: string
): boolean {
  // Walk history: if we find a previous response from this participant
  // that was a clarification, the user is now answering
  for (const turn of chatContext.history) {
    if (turn instanceof vscode.ChatResponseTurn && turn.participant === 'unfold.agent') {
      const metadata = turn.result.metadata as UnfoldChatResultMetadata | undefined;
      if (metadata?.awaitingClarification && metadata.command === command) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Sends a clarification request to the LLM and streams the questions to the user.
 */
export async function sendClarificationRequest(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  level: GuidanceLevel,
  command: string,
  planContext?: string,
  workspaceContext?: WorkspaceContext
): Promise<UnfoldChatResultMetadata> {
  stream.progress('Thinking about what to ask...');

  const clarificationUserPrompt = getClarificationPrompt(request.prompt, level, planContext, workspaceContext);

  const messages = [
    vscode.LanguageModelChatMessage.User(clarificationUserPrompt),
  ];

  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) {
        return { command, filesWritten: [] };
      }
      stream.markdown(chunk);
    }
  } catch (err) {
    stream.markdown('Failed to generate clarifying questions.\n\n' + String(err));
    return { command, filesWritten: [] };
  }

  return { command, filesWritten: [], awaitingClarification: true };
}

/**
 * Sends the actual plan generation request and returns the raw LLM output.
 * Returns null if the request failed or was cancelled.
 */
export async function sendPlanGenerationRequest(
  messages: vscode.LanguageModelChatMessage[],
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<string | null> {
  let llmOutput = '';
  try {
    const response = await request.model.sendRequest(messages, {}, token);
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) {
        stream.markdown('Generation cancelled.');
        return null;
      }
      llmOutput += chunk;
    }
  } catch (err) {
    stream.markdown('Failed to generate plan. Make sure you have a language model provider available.\n\n' + String(err));
    return null;
  }
  return llmOutput;
}
