import * as vscode from 'vscode';
import { SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { buildConvertPrompt } from '../prompts/convertPrompt';
import { parseGeneratedPlan, UnfoldChatResultMetadata } from '../types';
import { writePlanFiles } from '../PlanFileWriter';
import { getGuidanceLevel, getStepDetailLevel } from '../GuidanceLevel';
import { sendPlanGenerationRequest } from '../clarificationFlow';

export async function handleConvert(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<UnfoldChatResultMetadata> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    stream.markdown('Please open a workspace folder first so I can write plan files.');
    return { command: 'convert', filesWritten: [] };
  }

  // Try to get plan text from references (attached files) or from the prompt
  let planText = '';

  if (request.references && request.references.length > 0) {
    for (const ref of request.references) {
      if (ref.value instanceof vscode.Uri) {
        try {
          const content = await vscode.workspace.fs.readFile(ref.value);
          planText += new TextDecoder().decode(content) + '\n\n';
        } catch {
          stream.markdown(`Could not read referenced file: ${ref.value.fsPath}\n`);
        }
      } else if (typeof ref.value === 'string') {
        planText += ref.value + '\n\n';
      }
    }
  }

  if (!planText.trim()) {
    planText = request.prompt;
  }

  if (!planText.trim()) {
    stream.markdown('Please provide a plan to convert. You can:\n\n- Paste the plan text directly\n- Attach a file using `#file`\n\nExample: `@unfold /convert 1. Setup project 2. Add auth 3. Build API`');
    return { command: 'convert', filesWritten: [] };
  }

  stream.progress('Converting plan to Unfold format...');

  const level = getGuidanceLevel();
  const stepDetailLevel = getStepDetailLevel();

  const messages = [
    vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    vscode.LanguageModelChatMessage.User(buildConvertPrompt(planText, level, stepDetailLevel)),
  ];

  const llmOutput = await sendPlanGenerationRequest(messages, request, stream, token);
  if (llmOutput === null) {
    return { command: 'convert', filesWritten: [] };
  }

  let specs;
  try {
    specs = parseGeneratedPlan(llmOutput);
  } catch (err) {
    stream.markdown('Failed to parse the converted plan. Raw output:\n\n```\n' + llmOutput + '\n```\n\nError: ' + String(err));
    return { command: 'convert', filesWritten: [] };
  }

  if (token.isCancellationRequested) {
    return { command: 'convert', filesWritten: [] };
  }

  const writtenPaths = await writePlanFiles(specs, workspaceFolder.uri.fsPath);

  stream.markdown(`Plan converted with **${writtenPaths.length}** files:\n\n`);
  for (const spec of specs) {
    stream.markdown(`- \`${spec.relativePath}\` - ${spec.frontmatter.title}\n`);
  }

  stream.button({
    command: 'unfold.refreshTree',
    title: 'Refresh Plan Tree',
  });

  return {
    command: 'convert',
    filesWritten: writtenPaths,
    planRootId: specs.find(s => s.frontmatter.parent === '')?.frontmatter.id,
  };
}
