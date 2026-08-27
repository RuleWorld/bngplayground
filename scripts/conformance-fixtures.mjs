import {
  ProtocolError,
  ProtocolErrorCode,
  ResourceTemplate,
  completable,
  inputRequired,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function completeText(text) {
  return { content: [{ type: 'text', text }] };
}

function inputRequest(method, params) {
  return { method, params };
}

function elicitationRequest(message, properties) {
  return inputRequest('elicitation/create', {
    message,
    requestedSchema: {
      type: 'object',
      properties,
      required: Object.keys(properties),
    },
  });
}

function getResponse(ctx, key) {
  return ctx.mcpReq.inputResponses?.[key];
}

function responseContent(response) {
  if (!response || typeof response !== 'object') return undefined;
  if ('content' in response && response.content && typeof response.content === 'object') {
    return response.content;
  }
  if ('result' in response && response.result && typeof response.result === 'object') {
    return response.result;
  }
  return response;
}

function registerNoArgsTool(server, name, description, callback) {
  if (typeof description === 'function') {
    callback = description;
    description = `Conformance fixture: ${name}.`;
  }
  server.registerTool(name, {
    title: name,
    description,
    inputSchema: z.object({}),
  }, callback);
}

function registerBasicContentTools(server) {
  registerNoArgsTool(server, 'test_simple_text', 'Conformance fixture: returns simple text.', () => completeText('Simple text response'));
  registerNoArgsTool(server, 'test_image_content', 'Conformance fixture: returns an image.', () => ({
    content: [{ type: 'image', data: ONE_PIXEL_PNG, mimeType: 'image/png' }],
  }));
  registerNoArgsTool(server, 'test_audio_content', 'Conformance fixture: returns audio.', () => ({
    content: [{ type: 'audio', data: 'UklGRg==', mimeType: 'audio/wav' }],
  }));
  registerNoArgsTool(server, 'test_embedded_resource', 'Conformance fixture: returns an embedded resource.', () => ({
    content: [{
      type: 'resource',
      resource: {
        uri: 'test://embedded-resource',
        mimeType: 'text/plain',
        text: 'Embedded resource content',
      },
    }],
  }));
  registerNoArgsTool(server, 'test_multiple_content_types', 'Conformance fixture: returns mixed content.', () => ({
    content: [
      { type: 'text', text: 'Mixed content' },
      { type: 'image', data: ONE_PIXEL_PNG, mimeType: 'image/png' },
      {
        type: 'resource',
        resource: {
          uri: 'test://embedded-resource',
          mimeType: 'text/plain',
          text: 'Embedded resource content',
        },
      },
    ],
  }));
  registerNoArgsTool(server, 'test_error_handling', 'Conformance fixture: returns a tool error.', () => ({
    isError: true,
    content: [{ type: 'text', text: 'Expected conformance fixture error' }],
  }));
  registerNoArgsTool(server, 'test_tool_with_progress', 'Conformance fixture: sends progress notifications.', async (_ctx, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    for (let progress = 1; progress <= 3; progress += 1) {
      await ctx.mcpReq.notify({
        method: 'notifications/progress',
        params: { progressToken, progress, total: 3 },
      });
    }
    return completeText('Progress complete');
  });
}

function registerDiagnosticTools(server, notify) {
  registerNoArgsTool(server, 'test_streaming_elicitation', 'Conformance fixture: emits a normal response stream.', () => completeText('Streaming fixture complete'));
  registerNoArgsTool(server, 'test_logging_tool', 'Conformance fixture: does not log without an authorized log level.', () => completeText('Logging fixture complete'));
  registerNoArgsTool(server, 'test_missing_capability', 'Conformance fixture: diagnostic capability gate target.', (_args, ctx) => {
    const capabilities = ctx.mcpReq.envelope?.['io.modelcontextprotocol/clientCapabilities'] ?? {};
    if (!capabilities.sampling) {
      return inputRequired({
        inputRequests: {
          sampling: inputRequest('sampling/createMessage', {
            messages: [{ role: 'user', content: { type: 'text', text: 'Capability gate' } }],
            maxTokens: 1,
          }),
        },
      });
    }
    return completeText('Capability fixture complete');
  });
  registerNoArgsTool(server, 'test_trigger_tool_change', 'Conformance fixture: triggers a tool-list change notification.', () => {
    notify?.toolsChanged();
    return completeText('Tool change triggered');
  });
}

function registerInputRequiredTools(server) {
  registerNoArgsTool(server, 'test_input_required_result_elicitation', 'Conformance fixture: elicitation multi-round result.', (_args, ctx) => {
    const response = getResponse(ctx, 'user_name');
    if (!response || response.action === 'decline' || response.action === 'cancel') {
      return inputRequired({
        inputRequests: {
          user_name: elicitationRequest('What is your name?', { name: { type: 'string' } }),
        },
      });
    }
    const content = responseContent(response);
    return completeText(`Hello, ${content?.name ?? 'friend'}!`);
  });

  registerNoArgsTool(server, 'test_input_required_result_sampling', (_args, ctx) => {
    const response = getResponse(ctx, 'capital_question');
    if (!response) {
      return inputRequired({
        inputRequests: {
          capital_question: inputRequest('sampling/createMessage', {
            messages: [{ role: 'user', content: { type: 'text', text: 'What is the capital of France?' } }],
            maxTokens: 100,
          }),
        },
      });
    }
    return completeText(`Sampling response received: ${responseContent(response)?.content ?? 'ok'}`);
  });

  registerNoArgsTool(server, 'test_input_required_result_list_roots', (_args, ctx) => {
    const response = getResponse(ctx, 'client_roots');
    if (!response) {
      return inputRequired({ inputRequests: { client_roots: inputRequest('roots/list', {}) } });
    }
    return completeText(`Roots response received: ${JSON.stringify(responseContent(response) ?? {})}`);
  });

  registerNoArgsTool(server, 'test_input_required_result_request_state', (_args, ctx) => {
    const state = ctx.mcpReq.requestState();
    if (state !== 'state-ok') {
      return inputRequired({
        inputRequests: {
          confirm: elicitationRequest('Please confirm', { ok: { type: 'boolean' } }),
        },
        requestState: 'state-ok',
      });
    }
    return completeText('state-ok');
  });

  registerNoArgsTool(server, 'test_input_required_result_tampered_state', (_args, ctx) => {
    const state = ctx.mcpReq.requestState();
    if (state !== undefined && state !== 'tamper-protected-state') {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Invalid or expired requestState', {
        reason: 'invalid_request_state',
      });
    }
    if (state === 'tamper-protected-state') return completeText('state validated');
    return inputRequired({
      inputRequests: {
        confirm: elicitationRequest('Please confirm', { ok: { type: 'boolean' } }),
      },
      requestState: 'tamper-protected-state',
    });
  });

  registerNoArgsTool(server, 'test_input_required_result_multiple_inputs', (_args, ctx) => {
    const responses = ctx.mcpReq.inputResponses ?? {};
    if (!responses.user_name || !responses.greeting || !responses.client_roots) {
      return inputRequired({
        inputRequests: {
          user_name: elicitationRequest('What is your name?', { name: { type: 'string' } }),
          greeting: inputRequest('sampling/createMessage', {
            messages: [{ role: 'user', content: { type: 'text', text: 'Generate a greeting' } }],
            maxTokens: 50,
          }),
          client_roots: inputRequest('roots/list', {}),
        },
        requestState: 'multiple-inputs',
      });
    }
    return completeText('All input responses received');
  });

  registerNoArgsTool(server, 'test_input_required_result_multi_round', (_args, ctx) => {
    const state = ctx.mcpReq.requestState();
    if (state === 'round-1') {
      return inputRequired({
        inputRequests: {
          step2: elicitationRequest('Step 2: What is your favorite color?', { color: { type: 'string' } }),
        },
        requestState: 'round-2',
      });
    }
    if (state === 'round-2') return completeText('Multi-round complete');
    return inputRequired({
      inputRequests: {
        step1: elicitationRequest('Step 1: What is your name?', { name: { type: 'string' } }),
      },
      requestState: 'round-1',
    });
  });

  registerNoArgsTool(server, 'test_input_required_result_capabilities', (_args, ctx) => {
    const capabilities = ctx.mcpReq.envelope?.['io.modelcontextprotocol/clientCapabilities'] ?? {};
    const inputRequests = {};
    if (capabilities.sampling) {
      inputRequests.sampling = inputRequest('sampling/createMessage', {
        messages: [{ role: 'user', content: { type: 'text', text: 'Capability test' } }],
        maxTokens: 10,
      });
    }
    if (capabilities.elicitation) inputRequests.elicitation = elicitationRequest('Capability test', { ok: { type: 'boolean' } });
    if (capabilities.roots) inputRequests.roots = inputRequest('roots/list', {});
    return Object.keys(inputRequests).length > 0
      ? inputRequired({ inputRequests })
      : completeText('No declared client input capabilities');
  });
}

function registerResources(server) {
  server.registerResource(
    'test-static-text',
    'test://static-text',
    { title: 'Static text fixture', mimeType: 'text/plain' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'This is the content of the static text resource.' }] }),
  );
  server.registerResource(
    'test-static-binary',
    'test://static-binary',
    { title: 'Static binary fixture', mimeType: 'image/png' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'image/png', blob: ONE_PIXEL_PNG }] }),
  );
  server.registerResource(
    'test-template',
    new ResourceTemplate('test://template/{id}/data', {
      list: async () => ({ resources: [{ uri: 'test://template/123/data', name: 'Template fixture' }] }),
    }),
    { title: 'Template fixture', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = variables.id ?? uri.pathname.split('/')[2] ?? 'unknown';
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ id, templateTest: true, data: `Data for ID: ${id}` }),
        }],
      };
    },
  );
}

function registerPrompts(server) {
  server.registerPrompt('test_simple_prompt', { title: 'Simple prompt', description: 'Conformance fixture prompt.' }, () => ({
    messages: [{ role: 'user', content: { type: 'text', text: 'This is a simple prompt.' } }],
  }));
  server.registerPrompt(
    'test_prompt_with_arguments',
    {
      title: 'Prompt with arguments',
      description: 'Conformance fixture prompt with arguments.',
      argsSchema: {
        arg1: completable(z.string(), () => ['testValue1', 'testValue2']),
        arg2: z.string(),
      },
    },
    ({ arg1, arg2 }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: `Arguments: ${arg1}, ${arg2}` } }],
    }),
  );
  server.registerPrompt('test_prompt_with_embedded_resource', {
    title: 'Prompt with resource',
    description: 'Conformance fixture prompt with an embedded resource.',
  }, () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'resource',
        resource: { uri: 'test://embedded-prompt', mimeType: 'text/plain', text: 'Prompt resource' },
      },
    }],
  }));
  server.registerPrompt('test_prompt_with_image', {
    title: 'Prompt with image',
    description: 'Conformance fixture prompt with an image.',
  }, () => ({
    messages: [{ role: 'user', content: { type: 'image', data: ONE_PIXEL_PNG, mimeType: 'image/png' } }],
  }));
  server.registerPrompt('test_input_required_result_prompt', {
    title: 'Input-required prompt',
    description: 'Conformance fixture prompt requiring elicitation input.',
  }, (ctx) => {
    const response = getResponse(ctx, 'user_context');
    if (!response) {
      return inputRequired({
        inputRequests: {
          user_context: elicitationRequest('What context should the prompt use?', { context: { type: 'string' } }),
        },
      });
    }
    return {
      messages: [{ role: 'user', content: { type: 'text', text: `Context: ${responseContent(response)?.context ?? 'provided'}` } }],
    };
  });
}

function registerCompletionSchemaTool(server) {
  const schema = z.object({ name: z.string() }).meta({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      address: {
        $anchor: 'addressDef',
        type: 'object',
        properties: { street: { type: 'string' }, city: { type: 'string' } },
      },
    },
    allOf: [{ anyOf: [{ required: ['phone'] }, { required: ['email'] }] }],
    if: { properties: { contactMethod: { const: 'phone' } }, required: ['contactMethod'] },
    then: { required: ['phone'] },
    else: { required: ['email'] },
    additionalProperties: false,
  });
  server.registerTool('json_schema_2020_12_tool', {
    title: 'JSON Schema 2020-12 fixture',
    description: 'Conformance fixture preserving modern JSON Schema keywords.',
    inputSchema: schema,
  }, () => completeText('JSON Schema fixture complete'));
}

function registerCustomHeaderTools(server) {
  const customHeaderSchema = z.object({
    region: z.string().meta({ 'x-mcp-header': 'Region' }),
    priority: z.number().int().meta({ 'x-mcp-header': 'Priority' }),
    verbose: z.boolean().nullable().optional(),
    query: z.string(),
  });
  server.registerTool('test_custom_headers', {
    title: 'Custom header fixture',
    description: 'Conformance fixture for x-mcp-header validation.',
    inputSchema: customHeaderSchema,
  }, () => completeText('Custom headers test completed'));
  server.registerTool('test_custom_headers_null', {
    title: 'Custom header null fixture',
    description: 'Conformance fixture for omitted null header values.',
    inputSchema: customHeaderSchema,
  }, () => completeText('Custom headers null test completed'));
}

export function registerConformanceFixtures(server, notify) {
  registerBasicContentTools(server);
  registerDiagnosticTools(server, notify);
  registerInputRequiredTools(server);
  registerResources(server);
  registerPrompts(server);
  registerCompletionSchemaTool(server);
  registerCustomHeaderTools(server);
}
