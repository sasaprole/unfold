---
id: "comp-02-01"
title: "FileWatcher Component"
level: 3
status: "in-progress"
parent: "../../steps/03-build-tree-view.md"
order: 1
icon: "fa:eye"
---

# FileWatcher Component

## Context
Watches the workspace for markdown file changes and triggers tree refresh.

## Detail

### Debounce Strategy

```mermaid
sequenceDiagram
    participant FS as FileSystem
    participant FW as FileWatcher
    participant Deb as Debounce Timer
    participant TP as TreeProvider

    FS->>FW: File changed
    FW->>Deb: Start 300ms timer
    FS->>FW: Another change
    FW->>Deb: Reset timer
    Note over Deb: Wait 300ms
    Deb->>FW: Timer expired
    FW->>TP: Refresh tree
    TP->>FW: Tree updated
```

### Events Handled
- `onDidChange` - File content modified
- `onDidCreate` - New file added
- `onDidDelete` - File removed

## Dependencies
- Step 03: Build Tree View

## Acceptance Criteria
- [x] Watches all .md files in workspace
- [x] Debounces rapid changes
- [x] Triggers tree refresh
