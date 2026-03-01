import * as vscode from 'vscode';

export type GuidanceLevel = 'precise' | 'guided' | 'balanced' | 'creative';

export type StepDetailLevel = 'concise' | 'standard' | 'detailed' | 'comprehensive';

export function getGuidanceLevel(): GuidanceLevel {
  const config = vscode.workspace.getConfiguration('unfold');
  return config.get<GuidanceLevel>('guidanceLevel', 'balanced');
}

export function getStepDetailLevel(): StepDetailLevel {
  const config = vscode.workspace.getConfiguration('unfold');
  return config.get<StepDetailLevel>('stepDetailLevel', 'standard');
}

export function shouldAskClarifications(): boolean {
  const config = vscode.workspace.getConfiguration('unfold');
  return config.get<boolean>('askBeforeGenerating', true);
}
