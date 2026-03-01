---
id: "code-01-01-01-01"
title: "Extension Host Communication"
level: 5
status: "complete"
parent: "../../../../components/01/01-plan-tree-provider.md"
order: 1
icon: "fa:server"
---

# Extension Host Communication

## Code

### How VS Code TreeDataProvider communicates with extension host

```typescript
// In extension.ts
const treeDataProvider = new PlanTreeProvider();
vscode.window.createTreeView('unfoldPlanTree', {
  treeDataProvider: treeDataProvider
});

// TreeDataProvider interface
interface TreeDataProvider<T> {
  getChildren(element?: T): ProviderResult<T[]>;
  getTreeItem(element: T): TreeItem | Thenable<TreeItem>;
}
```

## Explanation

VS Code calls `getChildren()` when:
- Tree view first loads (element is undefined → return roots)
- User expands a node (element is the parent node → return its children)

## Complexity
O(n) where n = number of children at current level
