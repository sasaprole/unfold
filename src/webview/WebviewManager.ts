import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { PlanNode } from '../tree/PlanNode';
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
  SectionData,
  BreadcrumbItem,
} from '../shared/messages';

export class WebviewManager {
  private panel: vscode.WebviewPanel | null = null;
  private md: MarkdownIt;
  private currentNodes = new Map<string, PlanNode>();
  private rootNodes: PlanNode[] = [];
  private currentSectionId: string | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: (str, lang) => {
        // Handle Mermaid diagrams - preserve as-is for client-side rendering
        if (lang === 'mermaid') {
          return `<pre class="mermaid-block"><code class="mermaid-diagram">${this.md.utils.escapeHtml(str)}</code></pre>`;
        }

        // Handle other languages with highlight.js
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang }).value;
          } catch {
            // Fall through
          }
        }
        return '';
      },
    });
  }

  setPlanRoots(roots: PlanNode[]): void {
    this.rootNodes = roots;
    this.currentNodes.clear();
    for (const root of roots) {
      this.buildNodeMap(root, []);
    }
  }

  setPlanRoot(root: PlanNode): void {
    this.setPlanRoots([root]);
  }

  /** Refresh the currently displayed section if any */
  refreshCurrentSection(): void {
    if (!this.currentSectionId) return;

    const node = this.currentNodes.get(this.currentSectionId);
    if (node) {
      this.loadSection(node);
    }
  }

  private buildNodeMap(node: PlanNode, breadcrumb: BreadcrumbItem[]): void {
    const currentBreadcrumb: BreadcrumbItem[] = [
      ...breadcrumb,
      { id: node.id, title: node.title, level: node.level },
    ];

    this.currentNodes.set(node.id, node);

    for (const child of node.children) {
      this.buildNodeMap(child, currentBreadcrumb);
    }
  }

  async openSection(node: PlanNode): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'unfold.sectionView',
        'Section View',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui'),
          ],
        }
      );

      this.panel.webview.html = this.getWebviewContent();

      this.panel.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage) => {
          this.handleMessage(message);
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    }

    await this.loadSection(node);
    this.sendTheme();
  }

  private async loadSection(node: PlanNode): Promise<void> {
    if (!this.panel) return;

    // Track current section for refresh
    this.currentSectionId = node.id;

    const breadcrumb = this.buildBreadcrumb(node);
    const html = this.renderMarkdown(node.content);
    const basePath = path.dirname(node.filePath);

    const message: ExtensionToWebviewMessage = {
      type: 'loadSection',
      data: {
        id: node.id,
        title: node.title,
        level: node.level,
        status: node.status,
        content: html,
        filePath: node.filePath,
        breadcrumb,
        basePath,
      },
    };

    this.panel.webview.postMessage(message);
  }

  private buildBreadcrumb(node: PlanNode): BreadcrumbItem[] {
    const breadcrumb: BreadcrumbItem[] = [];
    let current = node;

    while (current) {
      breadcrumb.unshift({
        id: current.id,
        title: current.title,
        level: current.level,
      });

      // Find parent
      const parent = this.findParent(current);
      current = parent;
    }

    return breadcrumb;
  }

  private findParent(node: PlanNode): PlanNode | null {
    for (const root of this.rootNodes) {
      const found = this.searchInTree(root, node);
      if (found) return found;
    }
    return null;
  }

  private searchInTree(target: PlanNode, node: PlanNode): PlanNode | null {
    for (const child of target.children) {
      if (child.id === node.id) return target;
      const found = this.searchInTree(child, node);
      if (found) return found;
    }
    return null;
  }

  private renderMarkdown(content: string): string {
    return this.md.render(content);
  }

  private sendTheme(): void {
    if (!this.panel) return;

    const theme = vscode.window.activeColorTheme.kind;
    let themeKind: 'dark' | 'light' | 'high-contrast' = 'light';

    if (theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast) {
      themeKind = 'dark';
    }

    const message: ExtensionToWebviewMessage = {
      type: 'themeChanged',
      theme: themeKind,
    };

    this.panel.webview.postMessage(message);
  }

  private handleMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case 'ready':
        this.sendTheme();
        break;

      case 'navigateTo':
        const node = this.currentNodes.get(message.sectionId);
        if (node) {
          this.loadSection(node);
        }
        break;

      case 'openInEditor':
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.filePath));
        break;

      case 'linkClicked':
        this.handleLinkClick(message.href, message.basePath);
        break;
    }
  }

  private async handleLinkClick(href: string, basePath: string): Promise<void> {
    // Resolve the href relative to the current file's directory
    const fullPath = path.resolve(basePath, href);

    // Check if this is a plan file we can navigate to
    const targetNode = this.findNodeByPath(fullPath);
    if (targetNode) {
      await this.loadSection(targetNode);
    } else {
      // Not a known plan file, open in editor
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fullPath));
    }
  }

  private findNodeByPath(filePath: string): PlanNode | null {
    for (const node of this.currentNodes.values()) {
      if (node.filePath === filePath) {
        return node;
      }
    }
    return null;
  }

  private getWebviewContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline';">
  <title>Unfold Section View</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    .breadcrumb {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .breadcrumb-item {
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
    }
    .breadcrumb-item:hover {
      text-decoration: underline;
    }
    .breadcrumb-separator {
      color: var(--vscode-foreground);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-wrap: wrap;
    }
    .title {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
    }
    .status-badge {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .status-not-started {
      background: var(--vscode-editorGhostForeground);
      color: var(--vscode-foreground);
    }
    .status-in-progress {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .status-complete {
      background: #1a5f1a;
      color: #89d185;
    }
    .status-blocked {
      background: var(--vscode-errorBackground);
      color: var(--vscode-errorForeground);
    }
    .level-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
    }
    .content {
      line-height: 1.6;
    }
    .content h1 {
      font-size: 2em;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    .content h2 {
      font-size: 1.5em;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 6px;
    }
    .content h3 {
      font-size: 1.25em;
    }
    .content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    .content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    .content pre code {
      background: transparent;
      padding: 0;
    }
    .content ul, .content ol {
      padding-left: 24px;
    }
    .content li {
      margin: 4px 0;
    }
    .content a {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }
    .content a:hover {
      text-decoration: underline;
    }
    .content img {
      max-width: 100%;
    }
    .open-file-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      margin-left: auto;
    }
    .open-file-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .open-file-btn .icon {
      font-size: 14px;
    }

    /* Mermaid diagram styles */
    .mermaid {
      display: flex;
      justify-content: center;
      margin: 20px 0;
      background: var(--vscode-editor-background);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--vscode-panel-border);
    }
    .mermaid svg {
      max-width: 100%;
      height: auto;
    }

    /* Mermaid theme - dark mode support */
    .mermaid .node rect,
    .mermaid .node circle,
    .mermaid .node ellipse,
    .mermaid .node polygon,
    .mermaid .node path {
      fill: var(--vscode-editor-background);
      stroke: var(--vscode-foreground);
      stroke-width: 1px;
    }
    .mermaid .edgePath .path {
      stroke: var(--vscode-foreground);
    }
    .mermaid .edgeLabel {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }
    .mermaid .cluster rect {
      fill: var(--vscode-editor-inactiveSelectionBackground);
      stroke: var(--vscode-foreground);
      stroke-width: 1px;
    }
    .mermaid .label {
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .mermaid text {
      fill: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="breadcrumb" id="breadcrumb"></div>
    <div class="header">
      <h1 class="title" id="title">Loading...</h1>
      <span class="level-badge" id="level"></span>
      <span class="status-badge" id="status"></span>
      <button class="open-file-btn" id="openFile">
        <span class="icon">⇪</span>
        <span>Open in Editor</span>
      </button>
    </div>
    <div class="content" id="content"></div>
  </div>

  <!-- Mermaid.js from CDN -->
  <script type="module" nonce="${nonce}">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    let mermaidInitialized = false;
    let currentTheme = 'light';

    // Initialize Mermaid with theme
    function initMermaid(theme) {
      currentTheme = theme;
      const mermaidTheme = theme === 'dark' ? 'dark' : 'default';

      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: 'loose',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 14,
      });
      mermaidInitialized = true;
    }

    // Render all Mermaid diagrams in the content
    async function renderMermaidDiagrams() {
      const mermaidBlocks = document.querySelectorAll('.mermaid-diagram');

      for (const block of mermaidBlocks) {
        try {
          // Re-initialize mermaid if theme changed
          if (mermaidInitialized) {
            const mermaidTheme = currentTheme === 'dark' ? 'dark' : 'default';
            mermaid.initialize({
              startOnLoad: false,
              theme: mermaidTheme,
              securityLevel: 'loose',
              fontFamily: 'var(--vscode-font-family)',
              fontSize: 14,
            });
          }

          const code = block.textContent;
          const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);

          // Create a container for the rendered diagram
          const container = document.createElement('div');
          container.className = 'mermaid';
          container.setAttribute('data-mermaid', code);

          // Replace the pre/code block with the container
          block.parentElement.replaceWith(container);

          // Render the diagram
          const { svg } = await mermaid.render(id, code);
          container.innerHTML = svg;
        } catch (error) {
          console.error('Mermaid render error:', error);
          // Show error in place
          const errorDiv = document.createElement('div');
          errorDiv.style.color = 'var(--vscode-errorForeground)';
          errorDiv.style.padding = '12px';
          errorDiv.style.background = 'var(--vscode-errorBackground)';
          errorDiv.style.borderRadius = '4px';
          errorDiv.textContent = 'Diagram error: ' + error.message;
          block.parentElement.replaceWith(errorDiv);
        }
      }
    }

    // Make functions available globally
    window.initMermaid = initMermaid;
    window.renderMermaidDiagrams = renderMermaidDiagrams;
  </script>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let currentTheme = 'light';

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'loadSection') {
        loadSection(message.data);
      } else if (message.type === 'themeChanged') {
        currentTheme = message.theme;
        if (window.initMermaid) {
          window.initMermaid(message.theme);
        }
      }
    });

    function loadSection(data) {
      document.getElementById('title').textContent = data.title;
      document.getElementById('level').textContent = getLevelName(data.level);
      document.getElementById('status').textContent = data.status.replace('-', ' ');
      document.getElementById('status').className = 'status-badge status-' + data.status;
      document.getElementById('content').innerHTML = data.content;

      // Store current basePath for link resolution
      window.currentBasePath = data.basePath;

      // Render Mermaid diagrams after content is loaded
      if (window.renderMermaidDiagrams) {
        window.renderMermaidDiagrams();
      }

      // Set up link click handlers
      setupLinkHandlers();

      // Build breadcrumb
      const breadcrumb = document.getElementById('breadcrumb');
      breadcrumb.innerHTML = '';
      data.breadcrumb.forEach((item, index) => {
        const span = document.createElement('span');
        span.className = 'breadcrumb-item';
        span.textContent = item.title;
        span.onclick = () => vscode.postMessage({ type: 'navigateTo', sectionId: item.id });
        breadcrumb.appendChild(span);

        if (index < data.breadcrumb.length - 1) {
          const sep = document.createElement('span');
          sep.className = 'breadcrumb-separator';
          sep.textContent = ' / ';
          breadcrumb.appendChild(sep);
        }
      });

      // Set up open file button
      const btn = document.getElementById('openFile');
      btn.onclick = () => vscode.postMessage({ type: 'openInEditor', filePath: data.filePath });
    }

    function setupLinkHandlers() {
      const content = document.getElementById('content');
      if (!content) return;

      // Add click handler to all links in the content
      const links = content.querySelectorAll('a[href]');
      links.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const href = link.getAttribute('href');
          if (href) {
            vscode.postMessage({
              type: 'linkClicked',
              href: href,
              basePath: window.currentBasePath || ''
            });
          }
        });
      });
    }

    function getLevelName(level) {
      const names = [
        'Context',        // Level 1
        'Workflow',       // Level 2
        'Detail',         // Level 3
        'Code',           // Level 4
        'Sub-Code',       // Level 5
        'Implementation', // Level 6
        'Snippet',        // Level 7
        'Micro'           // Level 8
      ];
      return names[level - 1] || 'Level ' + level;
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
