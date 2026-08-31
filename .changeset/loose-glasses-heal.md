---
'@mastra/core': patch
---

Fixed assigning a `Memory` instance or storage adapter to `Agent` and `Mastra` so TypeScript no longer reports a private-field mismatch across packages.

`Agent.memory`, `Mastra.memory`, and storage options now accept the public `IMastraMemory` and `IMastraCompositeStore` contracts instead of the branded class types. You can pass `new Memory({ storage })` into an agent without `@ts-expect-error`.

```ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

const memory = new Memory({
  storage: new PostgresStore({
    id: 'agent-memory',
    connectionString: process.env.DATABASE_URL!,
    disableInit: true,
  }),
});

export const agent = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'You are helpful.',
  model: 'openai/gpt-4o',
  memory,
});
```

See https://github.com/mastra-ai/mastra/issues/20202.
