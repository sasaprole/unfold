# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Unfold?

A VS Code extension that visualizes hierarchical plans stored as markdown files with YAML frontmatter. Plans are git-native, human-readable, and editable by any tool. The extension provides a sidebar tree view, a rich webview for reading plan sections, and an `@unfold` chat participant for LLM-powered plan generation.

## Build & Development Commands

```bash
npm install                # Install dependencies
npm run compile            # Build extension with esbuild
npm run compile:full       # Build extension + webview-ui React app
npm run watch              # Watch mode (extension only)
npm run watch:webview      # Watch mode (React webview)
npm run lint               # ESLint on src/ with TypeScript
```

To test locally: press F5 in VS Code to launch Extension Development Host. The extension activates when a workspace contains a `plan.md` file.

No test framework is configured yet.

## Architecture

**Data flow:** FileWatcher (debounced 300ms) → PlanParser (gray-matter + Zod) → PlanTreeProvider → UI refresh

**Module layout under `src/`:**
- `extension.ts` — Entry point, wires everything together
- `parser/` — `PlanParser` discovers `.md` files via fast-glob, parses YAML frontmatter, builds parent-child tree. `FrontmatterSchema` uses Zod for runtime validation
- `tree/` — `PlanTreeProvider` implements VS Code `TreeDataProvider`. `PlanNode` maps status/level to VS Code codicons (with FontAwesome fallback)
- `watcher/` — `FileWatcher` watches `**/*.md` with 300ms debounce
- `webview/` — `WebviewManager` renders markdown via markdown-it with highlight.js and Mermaid diagram support. Theme syncs with VS Code dark/light mode
- `chat/` — `ChatParticipant` registers `@unfold` with VS Code Chat API. Commands: `/create`, `/convert`, `/refine`. Uses prompt templates in `chat/prompts/`. `PlanFileWriter` serializes plans to disk, `PlanReader` provides existing plan context to LLM
- `shared/messages.ts` — Type-safe message protocol for Extension ↔ Webview postMessage communication

**Other directories:**
- `sample-plan/`, `cocktail-sample-plan/` — Example plan files for testing
- `webview-ui/` — Scaffolded React app (Vite + MUI), not yet implemented
- `.github/agents/unfold.agent.md` — GitHub Copilot agent instructions for planning workflow

## Plan File Format

Each `.md` file has YAML frontmatter validated by Zod:

```yaml
---
id: "kebab-case-id"        # Unique identifier
title: "Human readable"     # Display name
level: 1                    # 1=Context, 2=Workflow, 3=Detail, 4=Code
status: "not-started"       # not-started | in-progress | complete | blocked
parent: ""                  # Parent node's id (empty string for root)
order: 0                    # Sort position among siblings
icon: "fa:folder"           # Optional: codicon name or fa:name
---
Markdown body content here...
```

**Directory convention:**
- `plan.md` — Root (level 1)
- `steps/NN-name.md` — Level 2 (workflow/phases)
- `components/NN/NN-name.md` — Level 3 (detail/tasks)
- `code/NN/NN/name.md` — Level 4 (implementation)

## Key Design Decisions

- **Visualization-only extension** — No LLM calls from the extension itself; users bring their own tools
- **Zod validation** — All frontmatter is runtime-validated; invalid files are surfaced as errors
- **esbuild bundler** — Single output file at `out/extension.js`, configured in `esbuild.mjs`
- **Parent references use IDs**, not file paths
- **TypeScript strict mode** enabled (target ES2022, module Node16)

## Extension Settings

- `unfold.guidanceLevel` — Controls LLM elaboration: `precise | guided | balanced | creative`
- `unfold.askBeforeGenerating` — Whether to ask clarifying questions before plan generation

## Progress Tracking

See `TODO.md` for completed work and next steps. Current phase: core features complete, React webview and tests are upcoming.
