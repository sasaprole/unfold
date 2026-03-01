# Unfold - TODO

## Completed

- [x] Extension scaffold (package.json, tsconfig, esbuild)
- [x] Frontmatter schema with Zod validation
- [x] PlanParser - discovers .md files, parses frontmatter, builds tree
- [x] PlanNode model with level/status icons
- [x] PlanTreeProvider - VS Code TreeDataProvider
- [x] FileWatcher - debounced file system watcher
- [x] WebviewManager - HTML-only webview with markdown rendering
- [x] Sample plan directory with example files
- [x] Extension compiles and loads
- [x] **Mermaid diagram rendering** - Support for flowcharts, gantt charts, sequence diagrams

- [x] **@unfold Chat Participant** - AI-powered plan generation via VS Code Chat API
  - [x] Chat participant registration with `@unfold` mention
  - [x] `/create` command - generate plans from natural language descriptions
  - [x] `/convert` command - convert Copilot/Claude/text plans to Unfold format
  - [x] `/refine` command - update/expand existing plans
  - [x] System + command-specific prompts for LLM
  - [x] PlanFileWriter - serializes generated plans to .md files
  - [x] PlanReader - reads existing plans for LLM context
  - [x] Followup provider with contextual suggestions
  - [x] Bumped VS Code engine to ^1.93.0 for Chat Participant API

## Completed (2026-02-26)

- [x] **Smart free-form prompt handling for @unfold chat participant**
  - [x] Intent detection utility (`src/chat/intentDetection.ts`) - keyword-based mapping of prompts to commands
  - [x] Split `default` case in ChatParticipant switch: explicit `/create` vs `undefined` (no command)
  - [x] Smart default handler - checks for existing plan and routes to refine or create accordingly

## Completed (2026-02-26) - Codebase Analysis

- [x] **Codebase analysis for @unfold chat participant**
  - [x] `WorkspaceAnalyzer` - pre-gathers lightweight workspace context (file tree, language, framework, dependencies, README excerpt)
  - [x] `UnfoldTools` - 4 LM tools (getProjectStructure, readFile, searchCode, getDependencies) registered via `vscode.lm.registerTool()`
  - [x] `ToolCallLoop` - multi-turn tool-calling loop with max 5 iterations
  - [x] `externalTools` - discovers tools from other extensions via `vscode.lm.tools`
  - [x] Updated system prompt with codebase awareness instructions
  - [x] Updated `buildCreatePrompt` and `buildRefinePrompt` to accept and render workspace context
  - [x] Updated `CreateCommand` and `RefineCommand` to gather workspace context and use tool-calling loop
  - [x] Registered `languageModelTools` in `package.json`
  - [x] Tool registration in `extension.ts` activate()

## In Progress

None

## Completed (2025-02-26)

- [x] **Multi-plan support** - Show all root plans in webview and tree view
  - [x] WebviewManager supports multiple root nodes
  - [x] Root nodes visually distinct with `notebook` icon and "Plan" description
  - [x] New plans created under `.unfold/plans/<id>/` directory structure
  - [x] PlanParser allows `.unfold` directory to be discovered
  - [x] Navigation works across all plans

## Next Steps

### Phase 3: React Webview (Optional Enhancement)
- [ ] Scaffold `webview-ui/` React app (Vite + MUI)
- [ ] Implement React components (SectionViewer, StatusBadge, Breadcrumb)
- [ ] Wire up postMessage communication
- [ ] Theme syncing with VS Code

### Phase 4: Polish
- [ ] "Open in Editor" command improvements
- [ ] Handle edge cases: invalid frontmatter, missing parent refs
- [x] Multiple plan directories support
- [ ] Welcome view when no plan detected
- [ ] Error notifications for malformed files

### Phase 5: Stretch Goals
- [x] Mermaid diagram rendering
- [ ] Plan-level overview/dashboard
- [ ] Status filter in tree
- [ ] Export plan as merged .md or HTML
- [ ] Scaffold command for new plan templates
- [ ] Sequence diagrams in Mermaid
- [ ] State diagrams in Mermaid
- [ ] ER diagrams in Mermaid
- [ ] User journey diagrams in Mermaid
