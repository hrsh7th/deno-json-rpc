# deno-json-rpc

Strongly typed JSON-RPC module.

# Usage

```typescript
import { RPC, VSCodeIO } from '.../mod.ts'

type TextDocumentDefinitionRequest = {
  method: 'textDocument/definition';
  params: vscode.TextDocumentPositionParams;
  result: vscode.Location | vscode.Location[];
};

const rpc = new RPC<{
  IncomingRequest: TextDocumentDefinitionRequest;
  OutgoingRequest: never;
  IncomingNotification: never;
  OutgoingNotification: never;
}>({
  io: new VSCodeIO({
    reader: Deno.stdin,
    writer: Deno.stdout,
  })
});

rpc.onRequest('textDocument/definition', params => {
  return await findDefinition(params);
});

rpc.start();
```

