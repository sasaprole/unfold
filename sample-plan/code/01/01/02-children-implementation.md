---
id: "code-01-01-02"
title: "getChildren Implementation"
level: 4
status: "complete"
parent: "../../../components/01/01-plan-tree-provider.md"
order: 2
icon: "fa:list"
---

# getChildren Implementation

## Code

```typescript
getChildren(element?: PlanNode): PlanNode[] {
  if (element) {
    return element.children;
  }
  return this.rootNodes;
}
```

## Explanation
- If an element is provided, return its children (drill down)
- If no element, return root nodes (top level)

## Complexity
O(1) - Returns existing array reference

## Test Cases
- [x] Root level returns all plans
- [x] Child nodes return their children
- [x] Leaf nodes return empty array
