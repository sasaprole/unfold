import * as vscode from 'vscode';

const EXCLUDED_PATTERN = '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/.unfold/**,**/__pycache__/**,**/target/**,**/bin/**,**/obj/**,**/build/**}';

export interface ToolDefinition {
  tool: vscode.LanguageModelChatTool;
  execute: (input: Record<string, unknown>, token: vscode.CancellationToken) => Promise<vscode.LanguageModelToolResult>;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

const getProjectStructureTool: ToolDefinition = {
  tool: {
    name: 'unfold_getProjectStructure',
    description: 'List files and directories at a given path in the workspace. Returns a file tree useful for understanding project layout.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative path from workspace root. Defaults to root.' },
        depth: { type: 'number', description: 'Maximum depth to traverse. Defaults to 2.' },
      },
    },
  },
  execute: async (input) => {
    const root = getWorkspaceRoot();
    if (!root) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('No workspace folder open.')]);
    }

    const subPath = (input.path as string) || '';
    const depth = (input.depth as number) || 2;
    const baseUri = vscode.Uri.file(root + (subPath ? `/${subPath}` : ''));

    const pattern = new vscode.RelativePattern(baseUri, '**/*');
    const files = await vscode.workspace.findFiles(pattern, EXCLUDED_PATTERN, 300);

    const rootPath = baseUri.fsPath;
    const relativePaths = files
      .map(f => {
        const rel = f.fsPath.replace(rootPath, '').replace(/\\/g, '/');
        return rel.startsWith('/') ? rel.slice(1) : rel;
      })
      .filter(p => p.split('/').length <= depth)
      .sort();

    const result = relativePaths.length > 0
      ? relativePaths.join('\n')
      : '(no files found)';

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  },
};

const readFileTool: ToolDefinition = {
  tool: {
    name: 'unfold_readFile',
    description: 'Read the contents of a file in the workspace. Useful for examining source code, configuration, or documentation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative path from workspace root.' },
        maxLines: { type: 'number', description: 'Maximum number of lines to return. Defaults to 200.' },
      },
      required: ['path'],
    },
  },
  execute: async (input) => {
    const root = getWorkspaceRoot();
    if (!root) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('No workspace folder open.')]);
    }

    const filePath = input.path as string;
    const maxLines = (input.maxLines as number) || 200;

    try {
      const uri = vscode.Uri.file(`${root}/${filePath}`);
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
      const lines = content.split('\n');
      const truncated = lines.slice(0, maxLines);
      const result = truncated.join('\n');

      if (lines.length > maxLines) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(`${result}\n\n... (${lines.length - maxLines} more lines truncated)`),
        ]);
      }

      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
    } catch {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`File not found: ${filePath}`)]);
    }
  },
};

const searchCodeTool: ToolDefinition = {
  tool: {
    name: 'unfold_searchCode',
    description: 'Search for text patterns across workspace files. Returns matching lines with file paths and line numbers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Text pattern to search for (case-insensitive substring match).' },
        fileGlob: { type: 'string', description: 'Glob pattern to filter files. Defaults to "**/*".' },
        maxResults: { type: 'number', description: 'Maximum number of matching lines to return. Defaults to 20.' },
      },
      required: ['pattern'],
    },
  },
  execute: async (input) => {
    const root = getWorkspaceRoot();
    if (!root) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('No workspace folder open.')]);
    }

    const pattern = (input.pattern as string).toLowerCase();
    const fileGlob = (input.fileGlob as string) || '**/*';
    const maxResults = (input.maxResults as number) || 20;

    const files = await vscode.workspace.findFiles(fileGlob, EXCLUDED_PATTERN, 100);
    const matches: string[] = [];

    for (const file of files) {
      if (matches.length >= maxResults) { break; }

      try {
        const content = Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) { break; }
          if (lines[i].toLowerCase().includes(pattern)) {
            const relPath = file.fsPath.replace(root, '').replace(/\\/g, '/');
            const cleanPath = relPath.startsWith('/') ? relPath.slice(1) : relPath;
            matches.push(`${cleanPath}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    const result = matches.length > 0
      ? matches.join('\n')
      : `No matches found for "${input.pattern as string}"`;

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  },
};

const getDependenciesTool: ToolDefinition = {
  tool: {
    name: 'unfold_getDependencies',
    description: 'Extract dependency information from project manifest files (package.json, requirements.txt, Cargo.toml, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  execute: async () => {
    const root = getWorkspaceRoot();
    if (!root) {
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('No workspace folder open.')]);
    }

    const manifests = [
      { glob: 'package.json', parser: parsePackageJson },
      { glob: 'requirements.txt', parser: parseRequirementsTxt },
      { glob: 'Cargo.toml', parser: parseCargoToml },
      { glob: 'go.mod', parser: parseGoMod },
      { glob: '*.csproj', parser: parseCsproj },
    ];

    const results: string[] = [];

    for (const { glob, parser } of manifests) {
      const files = await vscode.workspace.findFiles(glob, EXCLUDED_PATTERN, 1);
      if (files.length > 0) {
        try {
          const content = Buffer.from(await vscode.workspace.fs.readFile(files[0])).toString('utf-8');
          const deps = parser(content);
          if (deps) {
            results.push(`### ${glob}\n${deps}`);
          }
        } catch {
          // Skip unreadable
        }
      }
    }

    const result = results.length > 0
      ? results.join('\n\n')
      : 'No dependency manifests found.';

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  },
};

function parsePackageJson(content: string): string {
  try {
    const pkg = JSON.parse(content);
    const lines: string[] = [];
    if (pkg.dependencies) {
      lines.push('**Dependencies:**');
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        lines.push(`  ${name}: ${version}`);
      }
    }
    if (pkg.devDependencies) {
      lines.push('**Dev Dependencies:**');
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        lines.push(`  ${name}: ${version}`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

function parseRequirementsTxt(content: string): string {
  return content.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 30).join('\n');
}

function parseCargoToml(content: string): string {
  const section = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
  if (!section) { return ''; }
  return section[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).slice(0, 30).join('\n');
}

function parseGoMod(content: string): string {
  const block = content.match(/require\s*\(([\s\S]*?)\)/);
  if (!block) { return ''; }
  return block[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).slice(0, 30).join('\n');
}

function parseCsproj(content: string): string {
  const refs = content.match(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g);
  if (!refs) { return ''; }
  return refs.slice(0, 30).map(r => {
    const match = r.match(/Include="([^"]+)"\s+Version="([^"]+)"/);
    return match ? `${match[1]}: ${match[2]}` : '';
  }).filter(Boolean).join('\n');
}

export function getUnfoldTools(): ToolDefinition[] {
  return [getProjectStructureTool, readFileTool, searchCodeTool, getDependenciesTool];
}

export function getUnfoldToolNames(): Set<string> {
  return new Set(getUnfoldTools().map(t => t.tool.name));
}

export function registerUnfoldTools(context: vscode.ExtensionContext): void {
  for (const toolDef of getUnfoldTools()) {
    const disposable = vscode.lm.registerTool(toolDef.tool.name, {
      invoke: async (options, token) => {
        const input = options.input as Record<string, unknown>;
        return toolDef.execute(input, token);
      },
    });
    context.subscriptions.push(disposable);
  }
}
