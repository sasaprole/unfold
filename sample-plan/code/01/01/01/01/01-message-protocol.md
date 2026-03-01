---
id: "code-01-01-01-01-01"
title: "Message Protocol Definition"
level: 6
status: "complete"
parent: "../../../../../components/01/01-plan-tree-provider.md"
order: 1
icon: "fa:exchange-alt"
---

# Message Protocol Definition

## Code

### Type-safe message contracts between extension and webview

```typescript
// Extension → Webview
type ExtensionToWebview = {
  type: 'loadSection';
  data: { id: string; title: string; content: string; };
} | {
  type: 'themeChanged';
  theme: 'dark' | 'light';
};

// Webview → Extension
type WebviewToExtension = {
  type: 'navigateTo';
  sectionId: string;
} | {
  type: 'openInEditor';
  filePath: string;
};
```

## Usage

```typescript
// Send from extension
panel.webview.postMessage({ type: 'loadSection', data: {...} });

// Receive in webview
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'loadSection') render(msg.data);
});
```

## Complexity
O(1) - Simple message passing
