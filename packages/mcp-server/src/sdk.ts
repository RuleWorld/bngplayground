// Compatibility bridge for @modelcontextprotocol/sdk.
// Prefer the real SDK when it is available in the environment, but keep a
// lightweight fallback so local tests can run without the package installed.

type Constructor<T = unknown> = new (...args: any[]) => T;

const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

let RealServer: Constructor | undefined;
let RealStdioServerTransport: Constructor | undefined;
let realListToolsRequestSchema: unknown;
let realCallToolRequestSchema: unknown;

try {
  const [serverModule, stdioModule, typesModule] = await Promise.all([
    dynamicImport('@modelcontextprotocol/sdk/server/index.js'),
    dynamicImport('@modelcontextprotocol/sdk/server/stdio.js'),
    dynamicImport('@modelcontextprotocol/sdk/types.js'),
  ]);

  RealServer = serverModule.Server;
  RealStdioServerTransport = stdioModule.StdioServerTransport;
  realListToolsRequestSchema = typesModule.ListToolsRequestSchema;
  realCallToolRequestSchema = typesModule.CallToolRequestSchema;
} catch {
  // Fall back to the local stub behavior.
}

export class Server {
  private handlers = new Map<unknown, (...args: any[]) => any>();
  private impl?: any;

  constructor(info: any, opts: any) {
    if (RealServer) {
      this.impl = new RealServer(info, opts);
    }
  }

  setRequestHandler(schema: unknown, handler: (...args: any[]) => any) {
    this.handlers.set(schema, handler);
    this.impl?.setRequestHandler?.(schema, handler);
  }

  async handle(schema: unknown, req: any) {
    const handler = this.handlers.get(schema);
    if (!handler) throw new Error('No handler');
    return handler(req);
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
  readonly impl?: any;

  constructor(...args: any[]) {
    if (RealStdioServerTransport) {
      this.impl = new RealStdioServerTransport(...args);
    }
  }
}

export const ListToolsRequestSchema = realListToolsRequestSchema ?? Symbol('ListToolsRequest');
export const CallToolRequestSchema = realCallToolRequestSchema ?? Symbol('CallToolRequest');
