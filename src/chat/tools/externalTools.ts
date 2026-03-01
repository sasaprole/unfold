import * as vscode from 'vscode';
import { getUnfoldToolNames } from './UnfoldTools';

const RELEVANT_TAGS = new Set(['workspace', 'code', 'file', 'search', 'codebase', 'project']);

/**
 * Discovers tools from other extensions via vscode.lm.tools.
 * Filters out our own unfold_* tools and selects tools with relevant tags.
 * Returns them in the LanguageModelChatTool format for passing to sendRequest.
 */
export function discoverExternalTools(): vscode.LanguageModelChatTool[] {
  try {
    const allTools = vscode.lm.tools;
    const ownToolNames = getUnfoldToolNames();

    const externalTools: vscode.LanguageModelChatTool[] = [];

    for (const tool of allTools) {
      // Skip our own tools
      if (ownToolNames.has(tool.name)) {
        continue;
      }

      // Check if tool has relevant tags
      const hasRelevantTag = tool.tags?.some(tag => RELEVANT_TAGS.has(tag.toLowerCase()));
      if (!hasRelevantTag) {
        continue;
      }

      externalTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as vscode.LanguageModelChatTool['inputSchema'],
      });
    }

    return externalTools;
  } catch {
    // vscode.lm.tools may not be available in older VS Code versions
    return [];
  }
}
