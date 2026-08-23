// Compatibility bridge for @modelcontextprotocol/sdk.
// Prefer the real SDK when it is available in the environment, but keep a
// lightweight fallback so local tests can run without the package installed.

type Constructor<T = unknown> = new (...args: unknown[]) => T;

interface RealServerInstance {
  setRequestHandler?: (schema: unknown, handler: (req: unknown) => Promise<unknown> | unknown) => void;
  connect?: (transport: unknown) => Promise<void> | void;
  listen?: (transport: unknown) => Promise<void> | void;
}

interface RealTransportInstance {
  impl?: unknown;
}

const dynamicImport = (specifier: string): Promise<Record<string, unknown>> => {
  switch (specifier) {
    case '@modelcontextprotocol/sdk/server/index.js':
      return import('@modelcontextprotocol/sdk/server/index.js') as Promise<Record<string, unknown>>;
    case '@modelcontextprotocol/sdk/server/stdio.js':
      return import('@modelcontextprotocol/sdk/server/stdio.js') as Promise<Record<string, unknown>>;
    case '@modelcontextprotocol/sdk/types.js':
      return import('@modelcontextprotocol/sdk/types.js') as Promise<Record<string, unknown>>;
    default:
      throw new Error(`Unauthorized import specifier: ${specifier}`);
  }
};

let RealServer: Constructor<RealServerInstance> | undefined;
let RealStdioServerTransport: Constructor<RealTransportInstance> | undefined;
let realListToolsRequestSchema: unknown;
let realCallToolRequestSchema: unknown;

try {
  const [serverModule, stdioModule, typesModule] = await Promise.all([
    dynamicImport('@modelcontextprotocol/sdk/server/index.js'),
    dynamicImport('@modelcontextprotocol/sdk/server/stdio.js'),
    dynamicImport('@modelcontextprotocol/sdk/types.js'),
  ]);

  RealServer = serverModule.Server as Constructor<RealServerInstance>;
  RealStdioServerTransport = stdioModule.StdioServerTransport as Constructor<RealTransportInstance>;
  realListToolsRequestSchema = typesModule.ListToolsRequestSchema;
  realCallToolRequestSchema = typesModule.CallToolRequestSchema;
} catch {
  // Fall back to the local stub behavior.
}

export class Server {
  private handlers = new Map<unknown, (req: never) => Promise<unknown> | unknown>();
  private impl?: RealServerInstance;

  constructor(info: unknown, opts?: unknown) {
    if (RealServer) {
      this.impl = new RealServer(info, opts);
    }
  }

  setRequestHandler<T>(schema: unknown, handler: (req: T) => Promise<unknown> | unknown) {
    this.handlers.set(schema, handler as (req: never) => Promise<unknown> | unknown);
    this.impl?.setRequestHandler?.(schema, handler as (req: unknown) => Promise<unknown> | unknown);
  }

  async handle(schema: unknown, req: unknown) {
    const handler = this.handlers.get(schema);
    if (!handler) throw new Error('No handler');
    return handler(req as never);
  }

  listen(transport?: StdioServerTransport) {
    if (this.impl?.connect) {
      return this.impl.connect(transport?.impl ?? transport);
    }
    if (this.impl?.listen) {
      return this.impl.listen(transport?.impl ?? transport);
    }
    console.log('MCP server listening (stub)');
  }
}

export class StdioServerTransport {
  readonly impl?: unknown;

  constructor(...args: unknown[]) {
    if (RealStdioServerTransport) {
      this.impl = new RealStdioServerTransport(...args);
    }
  }
}

export const ListToolsRequestSchema = realListToolsRequestSchema ?? Symbol('ListToolsRequest');
export const CallToolRequestSchema = realCallToolRequestSchema ?? Symbol('CallToolRequest');
