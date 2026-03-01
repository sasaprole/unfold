import { PlanParser } from '../parser/PlanParser';
import { PlanNode } from '../tree/PlanNode';

/**
 * Reads existing plan for LLM context. Wraps PlanParser.
 */
export class PlanReader {
  private parser = new PlanParser();

  /**
   * Returns a compact text representation of the current plan.
   */
  async getPlanSummary(workspaceRoot: string): Promise<string> {
    const roots = await this.parser.parseWorkspace(workspaceRoot);
    if (roots.length === 0) {
      return '(no existing plan found)';
    }

    const lines: string[] = [];
    const walk = (node: PlanNode, depth: number) => {
      const indent = '  '.repeat(depth);
      lines.push(`${indent}- [${node.id}] ${node.title} (level ${node.level}, ${node.status})`);
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    };

    for (const root of roots) {
      walk(root, 0);
    }

    return lines.join('\n');
  }

  /**
   * Returns a map of plan IDs to their file paths, for overwriting during refine.
   */
  async getIdToPathMap(workspaceRoot: string): Promise<Map<string, string>> {
    const roots = await this.parser.parseWorkspace(workspaceRoot);
    const map = new Map<string, string>();

    const walk = (node: PlanNode) => {
      map.set(node.id, node.filePath);
      for (const child of node.children) {
        walk(child);
      }
    };

    for (const root of roots) {
      walk(root);
    }

    return map;
  }
}
