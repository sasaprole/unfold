import * as vscode from 'vscode';
import { PlanParser, initOutputChannel, disposeOutputChannel, showOutputChannel } from './parser/PlanParser';
import { PlanTreeProvider } from './tree/PlanTreeProvider';
import { FileWatcher } from './watcher/FileWatcher';
import { WebviewManager } from './webview/WebviewManager';
import { PlanNode } from './tree/PlanNode';
import { registerChatParticipant } from './chat/ChatParticipant';
import { registerUnfoldTools } from './chat/tools/UnfoldTools';

let treeProvider: PlanTreeProvider;
let fileWatcher: FileWatcher;
let webviewManager: WebviewManager;

export function activate(context: vscode.ExtensionContext) {
  // Initialize output channel for warnings
  initOutputChannel(vscode);

  const parser = new PlanParser();
  treeProvider = new PlanTreeProvider();
  webviewManager = new WebviewManager(context);

  // Register tree view
  const treeView = vscode.window.createTreeView('unfoldPlanTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Initialize file watcher with webview manager
  fileWatcher = new FileWatcher(context, parser, treeProvider, webviewManager);
  fileWatcher.start();
  context.subscriptions.push(fileWatcher);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('unfold.openSection', async (node: PlanNode) => {
      // Build the full tree for navigation
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const roots = await parser.parseWorkspace(workspaceFolder.uri.fsPath);
        webviewManager.setPlanRoots(roots);
      }
      webviewManager.openSection(node);
    }),

    vscode.commands.registerCommand('unfold.refreshTree', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const roots = await parser.parseWorkspace(workspaceFolder.uri.fsPath);
        treeProvider.setRoots(roots);
      }
    }),

    vscode.commands.registerCommand('unfold.collapseAll', () => {
      treeView.dispose();
    }),

    vscode.commands.registerCommand('unfold.openInEditor', async (node: PlanNode) => {
      const doc = await vscode.workspace.openTextDocument(node.filePath);
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('unfold.showWarnings', () => {
      showOutputChannel();
    })
  );

  // Listen to theme changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      // Webview will handle theme update via CSS variables
    })
  );

  // Register LM tools for codebase analysis
  registerUnfoldTools(context);

  // Register chat participant
  registerChatParticipant(context);

  // Initial load
  vscode.commands.executeCommand('unfold.refreshTree');
}

export function deactivate() {
  fileWatcher?.dispose();
  webviewManager?.dispose();
  disposeOutputChannel();
}
