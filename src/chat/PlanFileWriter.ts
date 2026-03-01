import * as fs from 'fs';
import * as path from 'path';
import { PlanFileSpec } from './types';

/**
 * Serializes PlanFileSpec[] to .md files on disk.
 * The existing FileWatcher handles tree refresh automatically.
 */
export async function writePlanFiles(specs: PlanFileSpec[], workspaceRoot: string): Promise<string[]> {
  const writtenPaths: string[] = [];

  for (const spec of specs) {
    const absolutePath = path.join(workspaceRoot, spec.relativePath);
    const dir = path.dirname(absolutePath);

    // Create directories recursively
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Serialize frontmatter as YAML + body as markdown
    const frontmatterYaml = serializeFrontmatter(spec.frontmatter);
    const content = `---\n${frontmatterYaml}---\n\n${spec.body}\n`;

    fs.writeFileSync(absolutePath, content, 'utf-8');
    writtenPaths.push(absolutePath);
  }

  return writtenPaths;
}

function serializeFrontmatter(fm: PlanFileSpec['frontmatter']): string {
  const lines: string[] = [];
  lines.push(`id: "${fm.id}"`);
  lines.push(`title: "${fm.title}"`);
  lines.push(`level: ${fm.level}`);
  lines.push(`status: "${fm.status}"`);
  lines.push(`parent: "${fm.parent}"`);
  lines.push(`order: ${fm.order}`);
  if (fm.icon) {
    lines.push(`icon: "${fm.icon}"`);
  }
  return lines.join('\n') + '\n';
}
