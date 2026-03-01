import { TreeDataProvider, Event, TreeItem, EventEmitter } from 'vscode';
import { PlanNode } from './PlanNode';

export class PlanTreeProvider implements TreeDataProvider<PlanNode> {
  private _onDidChangeTreeData = new EventEmitter<PlanNode | undefined | null | void>();
  readonly onDidChangeTreeData: Event<PlanNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private rootNodes: PlanNode[] = [];

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setRoots(nodes: PlanNode[]): void {
    this.rootNodes = nodes;
    console.log('[Unfold] TreeProvider.setRoots called with', nodes.length, 'roots:', nodes.map(n => n.title));
    this.refresh();
  }

  getTreeItem(element: PlanNode): TreeItem {
    return element;
  }

  getChildren(element?: PlanNode): PlanNode[] {
    if (element) {
      return element.children;
    }
    return this.rootNodes;
  }

  getParent(element: PlanNode): PlanNode | null {
    // For simplicity, we don't track parent references in the tree
    // This can be enhanced if needed for navigation
    return null;
  }
}
