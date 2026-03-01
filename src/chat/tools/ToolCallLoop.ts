import * as vscode from 'vscode';
import { ToolDefinition } from './UnfoldTools';

/**
 * Sends a request to the LLM with tool-calling support.
 * Loops up to maxIterations times, executing tool calls and feeding results back.
 * Returns the accumulated text output (the final plan JSON).
 */
export async function sendRequestWithTools(
  messages: vscode.LanguageModelChatMessage[],
  tools: vscode.LanguageModelChatTool[],
  executors: Map<string, ToolDefinition['execute']>,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  maxIterations: number = 5
): Promise<string | null> {
  const conversationMessages = [...messages];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (token.isCancellationRequested) {
      stream.markdown('Generation cancelled.');
      return null;
    }

    let response: vscode.LanguageModelChatResponse;
    try {
      response = await request.model.sendRequest(
        conversationMessages,
        { tools: tools.length > 0 ? tools : undefined },
        token
      );
    } catch (err) {
      stream.markdown('Failed to generate plan. Make sure you have a language model provider available.\n\n' + String(err));
      return null;
    }

    // Collect all parts from the response stream
    const textParts: string[] = [];
    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

    for await (const part of response.stream) {
      if (token.isCancellationRequested) {
        stream.markdown('Generation cancelled.');
        return null;
      }

      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push(part);
      }
    }

    // If no tool calls, we have the final answer
    if (toolCalls.length === 0) {
      return textParts.join('');
    }

    // Execute tool calls
    stream.progress('Analyzing codebase...');

    // Add the assistant message with tool calls to the conversation
    const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
    if (textParts.length > 0) {
      assistantParts.push(new vscode.LanguageModelTextPart(textParts.join('')));
    }
    for (const call of toolCalls) {
      assistantParts.push(call);
    }
    conversationMessages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));

    // Execute each tool call and build the results message
    const toolResultParts: vscode.LanguageModelToolResultPart[] = [];

    for (const call of toolCalls) {
      const executor = executors.get(call.name);
      let result: vscode.LanguageModelToolResult;

      if (executor) {
        // Our own tool
        try {
          result = await executor(call.input as Record<string, unknown>, token);
        } catch (err) {
          result = new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Error executing ${call.name}: ${String(err)}`),
          ]);
        }
      } else {
        // Try external tool via vscode.lm.invokeTool
        try {
          result = await vscode.lm.invokeTool(call.name, { input: call.input, toolInvocationToken: undefined }, token);
        } catch (err) {
          result = new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Tool ${call.name} not available: ${String(err)}`),
          ]);
        }
      }

      toolResultParts.push(new vscode.LanguageModelToolResultPart(call.callId, result.content));
    }

    conversationMessages.push(vscode.LanguageModelChatMessage.User(toolResultParts));
  }

  // Max iterations reached — return whatever text we accumulated in the last response
  stream.markdown('*Reached maximum analysis iterations, generating plan with gathered context...*\n\n');

  // Make one final call without tools to get the plan
  let finalResponse: vscode.LanguageModelChatResponse;
  try {
    finalResponse = await request.model.sendRequest(conversationMessages, {}, token);
  } catch (err) {
    stream.markdown('Failed to generate final plan.\n\n' + String(err));
    return null;
  }

  let finalText = '';
  for await (const chunk of finalResponse.text) {
    if (token.isCancellationRequested) { return null; }
    finalText += chunk;
  }
  return finalText;
}
