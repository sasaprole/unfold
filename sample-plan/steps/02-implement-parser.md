---
id: "step-02"
title: "Implement Parser"
level: 2
status: "complete"
parent: "../plan.md"
order: 2
icon: "$(code)"
---

# Implement Parser

## Context
The parser reads markdown files with YAML frontmatter and builds a hierarchical tree structure.

## Data Flow

```mermaid
flowchart LR
    Files[.md Files] --> Glob[fast-glob]
    Glob --> GrayMatter[gray-matter]
    GrayMatter --> Zod[Zod Validation]
    Zod --> ValidFiles[Validated Files]
    ValidFiles --> BuildTree[Build Tree]
    BuildTree --> PlanNodes[PlanNode Hierarchy]
```

## Workflow
- Define Zod schema for frontmatter validation
- Use `gray-matter` to parse YAML frontmatter
- Use `fast-glob` to discover markdown files
- Build parent-child relationships using `parent` field
- Sort siblings by `order` field

## Dependencies
- Step 01: Extension scaffold must exist

## Acceptance Criteria
- [x] Frontmatter schema defined with validation
- [x] Parser discovers all `.md` files in workspace
- [x] Tree structure correctly built from parent references
- [x] Siblings sorted by order field
