import * as vscode from 'vscode';
import { handleCreate } from './commands/CreateCommand';
import { handleConvert } from './commands/ConvertCommand';
import { handleRefine } from './commands/RefineCommand';
import { UnfoldChatResultMetadata } from './types';
import { detectIntent } from './intentDetection';
import { PlanReader } from './PlanReader';

async function handleSmartDefault(
  request: vscode.ChatRequest,
  chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<UnfoldChatResultMetadata> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const reader = new PlanReader();
    const summary = await reader.getPlanSummary(workspaceFolder.uri.fsPath);
    if (summary !== '(no existing plan found)') {
      return handleRefine(request, chatContext, stream, token);
    }
  }
  return handleCreate(request, chatContext, stream, token);
}

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    let metadata: UnfoldChatResultMetadata;
    switch (request.command) {
      case 'convert':
        metadata = await handleConvert(request, stream, token);
        break;
      case 'refine':
        metadata = await handleRefine(request, chatContext, stream, token);
        break;
      case 'create':
        metadata = await handleCreate(request, chatContext, stream, token);
        break;
      default: {
        const intent = detectIntent(request.prompt);
        if (intent === 'refine') {
          metadata = await handleRefine(request, chatContext, stream, token);
        } else if (intent === 'convert') {
          metadata = await handleConvert(request, stream, token);
        } else {
          metadata = await handleSmartDefault(request, chatContext, stream, token);
        }
        break;
      }
    }
    return { metadata };
  };

  const participant = vscode.chat.createChatParticipant('unfold.agent', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'unfold-icon.svg');

  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken
    ): vscode.ChatFollowup[] {
      const metadata = result.metadata as UnfoldChatResultMetadata | undefined;
      if (!metadata) {
        return [];
      }

      const followups: vscode.ChatFollowup[] = [];

      // If we just asked clarifying questions, prompt the user to answer
      if (metadata.awaitingClarification) {
        followups.push({
          prompt: 'Go ahead with the defaults',
          command: metadata.command,
          label: 'Generate with defaults',
        });
        return followups;
      }

      if (metadata.command === 'create' && metadata.filesWritten.length > 0) {
        followups.push({
          prompt: 'Add more detail to the implementation steps',
          command: 'refine',
          label: 'Refine plan',
        });
      }

      if (metadata.command === 'convert' && metadata.filesWritten.length > 0) {
        followups.push({
          prompt: 'Expand the converted plan with more detail',
          command: 'refine',
          label: 'Refine converted plan',
        });
      }

      if (metadata.filesWritten.length === 0) {
        followups.push({
          prompt: 'Build a project plan',
          command: 'create',
          label: 'Create a new plan',
        });
      }

      return followups;
    },
  };

  context.subscriptions.push(participant);
}
