import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'fast-glob';
import { FrontmatterSchema, type Frontmatter } from './FrontmatterSchema';
import { PlanNode } from '../tree/PlanNode';

// Create output channel for warnings
let outputChannel: ReturnType<typeof import('vscode').window.createOutputChannel> | null = null;

export function initOutputChannel(vscode: typeof import('vscode')) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Unfold');
  }
}

export function getOutputChannel() {
  return outputChannel;
}

export function disposeOutputChannel() {
  outputChannel?.dispose();
  outputChannel = null;
}

export function showOutputChannel() {
  outputChannel?.show();
}

function logWarning(message: string) {
  console.warn(`[Unfold] ${message}`);
  outputChannel?.appendLine(`[Warning] ${message}`);
  // Don't auto-show to avoid interrupting user - they can open via command
}

export interface ParsedPlanFile {
  filePath: string;
  frontmatter: Frontmatter;
  content: string;
  rawMarkdown: string;
}

export class PlanParser {
  async parseWorkspace(workspaceRoot: string): Promise<PlanNode[]> {
    const planFiles = await this.findPlanFiles(workspaceRoot);
    const parsedFiles = await this.parseFiles(planFiles);

    if (parsedFiles.length === 0) {
      return [];
    }

    return this.buildTree(parsedFiles, workspaceRoot);
  }

  private async findPlanFiles(workspaceRoot: string): Promise<string[]> {
    try {
      const files = await glob('**/*.md', {
        cwd: workspaceRoot,
        absolute: true,
        onlyFiles: true,
        dot: true, // Include dot-directories (like .unfold)
      });
      return files.filter(file => {
        const relativePath = path.relative(workspaceRoot, file);
        const segments = relativePath.split(path.sep);
        // Exclude common exclusions, but allow .unfold directory
        return !segments.some(s =>
          (s.startsWith('.') && s !== '.unfold') ||
          s === 'node_modules' ||
          s === 'out' ||
          s === 'dist'
        );
      });
    } catch {
      return [];
    }
  }

  private async parseFiles(filePaths: string[]): Promise<ParsedPlanFile[]> {
    const results: ParsedPlanFile[] = [];
    const seenIds = new Map<string, string>(); // id -> filePath

    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = matter(content);

        if (!parsed.data.id) {
          continue; // Skip files without frontmatter
        }

        const frontmatter = FrontmatterSchema.parse(parsed.data);

        // Check for duplicate IDs
        const existingPath = seenIds.get(frontmatter.id);
        if (existingPath) {
          const relativePath = path.relative(process.cwd(), filePath);
          const relativeExisting = path.relative(process.cwd(), existingPath);
          logWarning(
            `Duplicate ID "${frontmatter.id}" found in ${relativePath}. ` +
            `Already used by ${relativeExisting}. Skipping duplicate.`
          );
          continue;
        }

        seenIds.set(frontmatter.id, filePath);
        results.push({
          filePath,
          frontmatter,
          content: parsed.content,
          rawMarkdown: content,
        });
      } catch (err) {
        // Skip files that fail parsing
        const relativePath = path.relative(process.cwd(), filePath);
        logWarning(`Failed to parse ${relativePath}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    return results;
  }

  private buildTree(parsedFiles: ParsedPlanFile[], workspaceRoot: string): PlanNode[] {
    // Create a map for quick lookup
    const fileMap = new Map<string, ParsedPlanFile>();
    const childrenMap = new Map<string, ParsedPlanFile[]>();

    for (const file of parsedFiles) {
      fileMap.set(file.frontmatter.id, file);
    }

    // Build parent-child relationships
    for (const file of parsedFiles) {
      const parentId = this.extractParentId(file.frontmatter.parent, file.filePath, workspaceRoot);
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(file);
    }

    // Create nodes recursively
    const rootNodes: PlanNode[] = [];
    const processed = new Set<string>();
    const skipped = new Set<string>();

    const createNode = (file: ParsedPlanFile, depth = 0): PlanNode | null => {
      // Prevent infinite recursion
      if (depth > 100) {
        logWarning(`Maximum depth exceeded for node "${file.frontmatter.id}" - possible circular reference`);
        return null;
      }

      if (processed.has(file.frontmatter.id)) {
        const relativePath = path.relative(workspaceRoot, file.filePath);
        logWarning(
          `Circular reference detected: "${file.frontmatter.id}" in ${relativePath}. ` +
          `Node already processed. Skipping.`
        );
        return null;
      }
      processed.add(file.frontmatter.id);

      const children = childrenMap.get(file.frontmatter.id) || [];
      const validChildren = children
        .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
        .map((child) => createNode(child, depth + 1))
        .filter((child): child is PlanNode => child !== null);

      return new PlanNode(
        file.frontmatter.id,
        file.frontmatter.title,
        file.frontmatter.level,
        file.frontmatter.status,
        file.filePath,
        file.frontmatter.parent,
        file.frontmatter.order,
        file.content,
        validChildren,
        file.frontmatter.icon
      );
    };

    // Find root nodes (files with empty parent or parent that doesn't exist in our map)
    for (const file of parsedFiles) {
      const parentId = this.extractParentId(file.frontmatter.parent, file.filePath, workspaceRoot);
      if (!fileMap.has(parentId) && !processed.has(file.frontmatter.id)) {
        const node = createNode(file);
        if (node) {
          rootNodes.push(node);
        }
      }
    }

    // Warn about skipped nodes
    if (skipped.size > 0) {
      logWarning(`Skipped ${skipped.size} nodes due to errors`);
    }

    // Sort root nodes by order
    const sortedRoots = rootNodes.sort((a, b) => a.order - b.order);
    console.log('[Unfold] Found root nodes:', sortedRoots.map(r => `${r.title} (${r.id})`));
    return sortedRoots;
  }

  private extractParentId(parentRef: string, filePath: string, workspaceRoot: string): string {
    if (!parentRef) {
      return '';
    }

    // If parentRef is already an ID, return it
    if (!parentRef.endsWith('.md')) {
      return parentRef;
    }

    // Otherwise, resolve the file path and find its ID
    const parentPath = path.resolve(path.dirname(filePath), parentRef);
    try {
      const content = fs.readFileSync(parentPath, 'utf-8');
      const parsed = matter(content);
      if (parsed.data.id) {
        return parsed.data.id;
      }
    } catch {
      // Parent file not readable
    }
    return '';
  }
}
