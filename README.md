# @neonloops/sdk

TypeScript SDK for [Neonloops](https://neonloops.com) — run AI workflows via API.

## Installation

```bash
npm install @neonloops/sdk
```

## Quick Start

```typescript
import { Runner } from "@neonloops/sdk";

const runner = new Runner({
  apiKey: process.env.NEONLOOPS_API_KEY!,
  // baseUrl: "https://neonloops.com", // optional, defaults to https://neonloops.com
});

const result = await runner.run("wf_abc123", {
  input: [{ role: "user", content: "Hello, run my workflow!" }],
});

console.log(result.output);
console.log(result.metadata.tokens); // { input: 42, output: 128 }
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | — | **Required.** Your Neonloops API key (`nl_sk_...`) |
| `baseUrl` | `string` | `https://neonloops.com` | Base URL of your Neonloops instance |
| `projectId` | `string` | — | Default project ID to scope requests |
| `timeoutMs` | `number` | `120000` | Request timeout in milliseconds |
| `maxRetries` | `number` | `2` | Max retries for 429/5xx errors |

## Run Options

```typescript
const result = await runner.run("wf_abc123", {
  input: [{ role: "user", content: "Translate this to French" }],
  variables: { targetLang: "fr" },  // optional workflow variables
  sessionId: "sess_xxx",            // optional for multi-turn
});
```

## Multi-Turn Conversations

```typescript
// Create a session
const session = await runner.createSession("wf_abc123");

// First turn
const r1 = await runner.run("wf_abc123", {
  input: [{ role: "user", content: "Hello!" }],
  sessionId: session.id,
});

// Follow-up — server loads previous messages automatically
const r2 = await runner.run("wf_abc123", {
  input: [{ role: "user", content: "Tell me more" }],
  sessionId: session.id,
});

// Retrieve message history
const messages = await runner.getSessionMessages(session.id);
```

## Error Handling

```typescript
import { Runner, NeonloopsApiError, NeonloopsTimeoutError } from "@neonloops/sdk";

try {
  const result = await runner.run("wf_abc123", {
    input: [{ role: "user", content: "Hello" }],
  });
} catch (err) {
  if (err instanceof NeonloopsApiError) {
    console.error(`API error ${err.status}: ${err.message}`);
  } else if (err instanceof NeonloopsTimeoutError) {
    console.error("Request timed out");
  }
}
```

## License

MIT
