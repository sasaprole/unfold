---
id: "step-01"
title: "Create Extension Scaffold"
level: 2
status: "complete"
parent: "../plan.md"
order: 1
icon: "fa:wrench"
---

# Create Extension Scaffold

## Context
Establish the foundation for the VS Code extension using the TypeScript + esbuild template.

## Workflow
- Initialize project with `yo code` or manual setup
- Configure `package.json` with contribution points
- Set up `tsconfig.json` for Node.js target
- Configure esbuild for bundling
- Create basic `extension.ts` with `activate()` function

## Dependencies
None

## Acceptance Criteria
- [x] Extension can be loaded in VS Code
- [x] Activity bar icon appears
- [x] Tree view container is registered
