import * as vscode from 'vscode';

export interface WorkspaceContext {
  fileTree: string;
  language: string;
  framework: string;
  dependencies: string;
  readmeExcerpt: string;
}

const EXCLUDED_DIRS = ['node_modules', 'out', 'dist', '.git', '.unfold', '.vscode', '__pycache__', 'target', 'bin', 'obj', 'build'];
const EXCLUDED_PATTERN = `{${EXCLUDED_DIRS.map(d => `**/${d}/**`).join(',')}}`;

interface DetectedStack {
  language: string;
  framework: string;
}

const CONFIG_FILES: Record<string, DetectedStack> = {
  'package.json': { language: 'TypeScript/JavaScript', framework: '' },
  'tsconfig.json': { language: 'TypeScript', framework: '' },
  'Cargo.toml': { language: 'Rust', framework: '' },
  'go.mod': { language: 'Go', framework: '' },
  'requirements.txt': { language: 'Python', framework: '' },
  'pyproject.toml': { language: 'Python', framework: '' },
  'pom.xml': { language: 'Java', framework: '' },
  'build.gradle': { language: 'Java/Kotlin', framework: '' },
  '.csproj': { language: 'C#', framework: '.NET' },
  'Gemfile': { language: 'Ruby', framework: '' },
  'composer.json': { language: 'PHP', framework: '' },
};

export class WorkspaceAnalyzer {
  async analyze(workspaceRoot: string): Promise<WorkspaceContext> {
    const rootUri = vscode.Uri.file(workspaceRoot);

    const [fileTree, stackAndDeps, readmeExcerpt] = await Promise.all([
      this.buildFileTree(rootUri),
      this.detectStackAndDeps(rootUri),
      this.readReadme(rootUri),
    ]);

    return {
      fileTree,
      language: stackAndDeps.language,
      framework: stackAndDeps.framework,
      dependencies: stackAndDeps.dependencies,
      readmeExcerpt,
    };
  }

  private async buildFileTree(rootUri: vscode.Uri): Promise<string> {
    const files = await vscode.workspace.findFiles('**/*', EXCLUDED_PATTERN, 500);

    // Build tree relative to workspace root
    const rootPath = rootUri.fsPath;
    const relativePaths = files
      .map(f => {
        const rel = f.fsPath.replace(rootPath, '').replace(/\\/g, '/');
        return rel.startsWith('/') ? rel.slice(1) : rel;
      })
      .filter(p => {
        // Limit to 3 levels of depth
        return p.split('/').length <= 3;
      })
      .sort();

    if (relativePaths.length === 0) {
      return '(empty workspace)';
    }

    return relativePaths.map(p => `  ${p}`).join('\n');
  }

  private async detectStackAndDeps(rootUri: vscode.Uri): Promise<{ language: string; framework: string; dependencies: string }> {
    let language = 'Unknown';
    let framework = '';
    let dependencies = '';

    // Check for config files
    for (const [configFile, stack] of Object.entries(CONFIG_FILES)) {
      const pattern = configFile.startsWith('.') ? `**/*${configFile}` : configFile;
      const found = await vscode.workspace.findFiles(pattern, EXCLUDED_PATTERN, 1);
      if (found.length > 0) {
        language = stack.language;
        framework = stack.framework;

        // Try to extract dependencies
        const deps = await this.extractDependencies(found[0], configFile);
        if (deps) {
          dependencies = deps;
        }
        break;
      }
    }

    // Detect framework from dependencies
    if (!framework && dependencies) {
      framework = this.detectFramework(dependencies);
    }

    return { language, framework, dependencies };
  }

  private async extractDependencies(fileUri: vscode.Uri, configFile: string): Promise<string> {
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf-8');

      if (configFile === 'package.json') {
        return this.extractNpmDeps(content);
      }
      if (configFile === 'requirements.txt') {
        return this.extractPythonDeps(content);
      }
      if (configFile === 'go.mod') {
        return this.extractGoDeps(content);
      }
      if (configFile === 'Cargo.toml') {
        return this.extractCargoDeps(content);
      }

      return '';
    } catch {
      return '';
    }
  }

  private extractNpmDeps(content: string): string {
    try {
      const pkg = JSON.parse(content);
      const deps: string[] = [];

      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        deps.push(`${name}: ${version}`);
      }
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        deps.push(`${name}: ${version} (dev)`);
      }

      return deps.slice(0, 30).join('\n');
    } catch {
      return '';
    }
  }

  private extractPythonDeps(content: string): string {
    return content
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'))
      .slice(0, 30)
      .join('\n');
  }

  private extractGoDeps(content: string): string {
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    if (!requireBlock) { return ''; }
    return requireBlock[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//'))
      .slice(0, 30)
      .join('\n');
  }

  private extractCargoDeps(content: string): string {
    const depsSection = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
    if (!depsSection) { return ''; }
    return depsSection[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .slice(0, 30)
      .join('\n');
  }

  private detectFramework(deps: string): string {
    const frameworks: [string, string][] = [
      ['react', 'React'],
      ['next', 'Next.js'],
      ['vue', 'Vue'],
      ['nuxt', 'Nuxt'],
      ['angular', 'Angular'],
      ['express', 'Express'],
      ['fastify', 'Fastify'],
      ['nestjs', 'NestJS'],
      ['django', 'Django'],
      ['flask', 'Flask'],
      ['fastapi', 'FastAPI'],
      ['spring', 'Spring'],
      ['rails', 'Rails'],
      ['laravel', 'Laravel'],
      ['actix', 'Actix'],
      ['axum', 'Axum'],
      ['gin', 'Gin'],
      ['echo', 'Echo'],
    ];

    const lowerDeps = deps.toLowerCase();
    for (const [keyword, name] of frameworks) {
      if (lowerDeps.includes(keyword)) {
        return name;
      }
    }
    return '';
  }

  private async readReadme(rootUri: vscode.Uri): Promise<string> {
    const readmeNames = ['README.md', 'readme.md', 'README.MD', 'README'];
    for (const name of readmeNames) {
      try {
        const uri = vscode.Uri.joinPath(rootUri, name);
        const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        const lines = content.split('\n').slice(0, 50);
        return lines.join('\n');
      } catch {
        // File not found, try next
      }
    }
    return '';
  }
}

export function formatWorkspaceContext(ctx: WorkspaceContext): string {
  const sections: string[] = [];

  sections.push('## Current Workspace\n');

  if (ctx.language !== 'Unknown') {
    sections.push(`**Language:** ${ctx.language}`);
  }
  if (ctx.framework) {
    sections.push(`**Framework:** ${ctx.framework}`);
  }

  if (ctx.fileTree && ctx.fileTree !== '(empty workspace)') {
    sections.push(`\n### File Structure\n\`\`\`\n${ctx.fileTree}\n\`\`\``);
  }

  if (ctx.dependencies) {
    sections.push(`\n### Dependencies\n\`\`\`\n${ctx.dependencies}\n\`\`\``);
  }

  if (ctx.readmeExcerpt) {
    sections.push(`\n### README (excerpt)\n${ctx.readmeExcerpt}`);
  }

  return sections.join('\n');
}
