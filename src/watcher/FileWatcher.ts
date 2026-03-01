import * as vscode from 'vscode';
import { PlanParser } from '../parser/PlanParser';
import { PlanTreeProvider } from '../tree/PlanTreeProvider';
import { WebviewManager } from '../webview/WebviewManager';

export class FileWatcher {
  private watcher: vscode.FileSystemWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 300;

  constructor(
    private context: vscode.ExtensionContext,
    private parser: PlanParser,
    private treeProvider: PlanTreeProvider,
    private webviewManager?: WebviewManager
  ) {}

  start(): void {
    if (this.watcher) {
      console.warn('[Unfold] File watcher already started');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.warn('[Unfold] No workspace folder, cannot start file watcher');
      return;
    }

    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, '**/*.md')
    );

    this.watcher.onDidChange((uri) => {
      console.log(`[Unfold] File changed: ${uri.fsPath}`);
      this.scheduleRefresh();
    });
    this.watcher.onDidCreate((uri) => {
      console.log(`[Unfold] File created: ${uri.fsPath}`);
      this.scheduleRefresh();
    });
    this.watcher.onDidDelete((uri) => {
      console.log(`[Unfold] File deleted: ${uri.fsPath}`);
      this.scheduleRefresh();
    });

    console.log('[Unfold] File watcher started for:', workspaceFolder.uri.fsPath);

    // Initial refresh
    this.refresh();
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.refresh();
    }, this.DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.warn('[Unfold] No workspace folder found for refresh');
      return;
    }

    try {
      const roots = await this.parser.parseWorkspace(workspaceFolder.uri.fsPath);
      this.treeProvider.setRoots(roots);

      // Update webview's node cache and refresh current section
      if (this.webviewManager && roots.length > 0) {
        this.webviewManager.setPlanRoots(roots);
        this.webviewManager.refreshCurrentSection();
      }

      console.log('[Unfold] Plan tree refreshed successfully');
    } catch (error) {
      console.error('[Unfold] Failed to refresh plan tree:', error);
    }
  }

  dispose(): void {
    this.stop();
  }
}
