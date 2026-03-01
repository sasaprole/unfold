---
id: "code-01-01-01-01-01-01"
title: "JSON Schema for Validation"
level: 7
status: "complete"
parent: "../../../../../../components/01/01-plan-tree-provider.md"
order: 1
icon: "fa:file-code"
---

# JSON Schema for Message Validation

## Code

### Runtime validation for webview messages

```typescript
import { z } from 'zod';

// Message schema
const LoadSectionSchema = z.object({
  type: z.literal('loadSection'),
  data: z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
  }),
});

// Usage
function handleMessage(msg: unknown) {
  const result = LoadSectionSchema.safeParse(msg);
  if (result.success) {
    // Type narrowed - TypeScript knows it's valid
    renderSection(result.data.data);
  } else {
    console.error('Invalid message:', result.error);
  }
}
```

## Why Zod?
- Runtime type safety
- Auto TypeScript type inference
- Great error messages
- Composable schemas

## Complexity
O(1) - Schema validation is linear in object size
