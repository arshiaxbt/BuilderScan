import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CallToolResultSchema, Progress, ProgressNotification, ProgressNotificationSchema, ToolListChangedNotification, ToolListChangedNotificationSchema, ListRootsRequest, ListRootsRequestSchema, ElicitRequest, ElicitRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { MCPActions, MCPServerInfo, MCPServerStatus } from '@cursor/types';
import { McpLogger } from '../utils/logger.js';
import { ExtraContext, registerAction } from './registry.js';
import { MCPOAuthClientProvider } from './mcp/oauth.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
// Type-only import for MCP schema definitions
import type { Prompt as MCPTargetPrompt, PromptArgument as MCPTargetPromptArgument } from '@modelcontextprotocol/sdk/types.js';

/** Get a server-specific logger instance */
function getLogger(identifier: string) {
	return McpLogger.getLogger(trim(identifier));
}

interface StdioServerInstance {
	transport: StdioClientTransport;
	client: Client;
	type: 'stdio';
	serverInfo: MCPServerInfo;
}

interface SSEServerInstance {
	transport: SSEClientTransport;
	client: Client;
	type: 'sse';
	serverInfo: MCPServerInfo;
}

interface StreamableHttpServerInstance {
	transport: StreamableHTTPClientTransport;
	client: Client;
	type: 'streamableHttp';
	serverInfo: MCPServerInfo;
}

type ServerInstance = StdioServerInstance | StreamableHttpServerInstance | SSEServerInstance;

/** Map from identifier to client info */
const servers = new Map<string, ServerInstance>();

/**
 * We need to sanitize mcp tool names since llm function calling
 * can't handle special chars, but we need the full real name to
 * actually call the mcp server tool.
 */
const toolNameMap = new Map<string, string>();

/** Map from request ID to resolve function for pending elicitation requests */
const pendingElicitationRequests = new Map<string, (response: any) => void>();

/** Map from server identifier to current toolCallId for that server */
const currentToolCallContext = new Map<string, string>();

let extensionContext: vscode.ExtensionContext | undefined;
let cachedUserAgent: string | undefined;

export function registerContext(context: vscode.ExtensionContext) {
	extensionContext = context;
}

/**
 * Gets the User-Agent string with Cursor name and version information.
 * Computed once and cached for efficiency.
 */
function getUserAgent(): string {
	if (cachedUserAgent) {
		return cachedUserAgent;
	}

	let cursorVersion = "unknown"

	try {
		// Read the actual Cursor version from product.json
		const productJsonPath = path.join(vscode.env.appRoot, 'product.json');
		const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
		cursorVersion = productJson.version || cursorVersion;
	} catch (error) {
		McpLogger.warn('Failed to read Cursor version from product.json, using VSCode version as fallback:', error);
	}

	const platform = `${os.platform()} ${os.arch()}`;
	cachedUserAgent = `Cursor/${cursorVersion} (${platform})`;

	return cachedUserAgent;
}

// Track the most recent status we have emitted for every server so that we can
// make smarter decisions about follow-up status updates (e.g. avoid overriding
// a `needsAuth` state with a transient connection error).
const lastStatusMap = new Map<string, MCPServerStatus>();

function updateStatus(identifier: string, status: MCPServerStatus) {
	// Persist latest status in the local map *before* forwarding to the UI so
	// that asynchronous handlers (like `client.onerror`) can reliably inspect
	// the current state without racing.
	lastStatusMap.set(identifier, status);

	try {
		vscode.commands.executeCommand('mcp.updateStatus', { identifier, status });
	} catch (err) {
		// Silently ignore errors – status updates are best-effort.
		getLogger(identifier).debug(`Failed to send status update`, err);
	}
}

function sanitizeToolName(name: string): string {
	// Replace spaces, periods, and hyphens with underscores, and remove any other special characters
	return name.replace(/[\s.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanupServer(identifier: string): void {
	const existingProcess = servers.get(identifier);
	if (!existingProcess) {
		return;
	}

	getLogger(identifier).info(`Cleaning up`);
	try {
		existingProcess.client.onclose = undefined;
		existingProcess.client.onerror = undefined;
		updateStatus(identifier, { type: 'disconnected' });
		existingProcess.client.close();
	} catch (error) {
		getLogger(identifier).error(`Error cleaning up client:`, error);
	}
	servers.delete(identifier);
	lastStatusMap.delete(identifier);

	// Clean up any pending elicitation requests for this server
	for (const [requestId, resolve] of pendingElicitationRequests.entries()) {
		if (requestId.startsWith(identifier)) {
			pendingElicitationRequests.delete(requestId);
			resolve({ action: 'cancel' }); // Cancel pending requests when server is cleaned up
		}
	}
}

function expandPath(command: string): string {
	// Get the workspace root path
	const workspaces = vscode.workspace.workspaceFolders;
	if (!workspaces || workspaces.length === 0) {
		McpLogger.warn('No workspace folders found, using current path for . expansion');
		return command;
	}
	const workspaceRoot = workspaces[0].uri.fsPath;

	// Split the command into parts
	const parts = command.split(' ');
	// Expand ~ in the first part (the executable path)
	if (parts[0].startsWith('~')) {
		parts[0] = path.join(os.homedir(), parts[0].slice(1));
	} else if (parts[0].startsWith('./') || parts[0] === '.') {
		parts[0] = path.join(workspaceRoot, parts[0].replace(/^\./, ''));
	}
	// Also expand ~ and . in any path arguments
	for (let i = 1; i < parts.length; i++) {
		if (parts[i].startsWith('~')) {
			parts[i] = path.join(os.homedir(), parts[i].slice(1));
		} else if (parts[i].startsWith('./') || parts[i] === '.') {
			parts[i] = path.join(workspaceRoot, parts[i].replace(/^\./, ''));
		}
	}
	return parts.join(' ');
}

async function getOrCreateClient(identifier: string, serverInfo: MCPServerInfo): Promise<Client> {
	if (!identifier) {
		throw new Error('Identifier is required');
	}

	let existingClient = servers.get(identifier);
	if (existingClient) {
		return existingClient.client;
	}

	const client = new Client(
		{
			name: 'cursor-vscode',
			version: '1.0.0'
		},
		{
			capabilities: {
				tools: true,
				prompts: true,
				resources: true,
				logging: false,
				elicitation: {},
				roots: {
					listChanged: false
				}
			}
		}
	);

	client.setRequestHandler(ListRootsRequestSchema, (request: ListRootsRequest) => {
		getLogger(identifier).info(`ListRootsRequest received`);
		return {
			roots: vscode.workspace.workspaceFolders?.map(folder => {
				return {
					uri: folder.uri.toString(),
					name: folder.name,
				}
			}) ?? []
		};
	});

	client.setNotificationHandler(ToolListChangedNotificationSchema, (notification: ToolListChangedNotification) => {
		getLogger(identifier).info(`ToolListChangedNotification received`);
		vscode.commands.executeCommand('mcp.toolListChanged', { identifier });
	});

	// Set up elicitation request handler
	client.setRequestHandler(ElicitRequestSchema, async (request: ElicitRequest) => {
		getLogger(identifier).info(`ElicitRequest received from server: ${request.params.message}`);
		return new Promise((resolve) => {
			const requestId = `${identifier}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			const currentToolCallId = currentToolCallContext.get(identifier);
			const elicitationRequest = {
				id: requestId,
				message: request.params.message,
				requestedSchema: request.params.requestedSchema,
				serverIdentifier: identifier, // Include server identifier to help with matching
				toolCallId: currentToolCallId // Include toolCallId to link to specific chat bubble
			};

			// Store the resolve function locally
			pendingElicitationRequests.set(requestId, resolve);

			// Send the request to the main process
			vscode.commands.executeCommand('mcp.elicitationRequest', { request: elicitationRequest });
		});
	});

	updateStatus(identifier, { type: 'initializing' });

	client.onerror = (error: Error) => {
		if (error instanceof UnauthorizedError) {
			return;
		}
		if (error.message.includes('SSE stream disconnected')) {
			getLogger(identifier).info(`SSE stream disconnected, transport will reconnect automatically`, error);
			return;
		}

		// If we are currently waiting for the user to complete OAuth we do NOT want
		// to replace the `needsAuth` status with an `error` status – that would hide
		// the UI that directs the user to authenticate. Instead, just log the error
		// and keep the status as-is so that the user can continue the auth flow.
		const last = lastStatusMap.get(identifier);
		if (last?.type === 'needsAuth') {
			getLogger(identifier).warn(`Ignoring transport error while awaiting OAuth`, error);
			return;
		}

		getLogger(identifier).error(`Client error for command`, error);
		updateStatus(identifier, { type: 'error', error: error.message });
	};

	client.onclose = () => {
		if (lastStatusMap.get(identifier)?.type === 'needsAuth') {
			return;
		}
		if (serverInfo.type === 'stdio') {
			getLogger(identifier).info(`Client closed for command`);
			updateStatus(identifier, { type: 'error', error: 'Client closed' });
		} else {
			getLogger(identifier).info(`Client closed for command`);
			updateStatus(identifier, { type: 'disconnected' });
		}
	};

	const transport = await createAndConnectTransportFor(identifier, serverInfo, client);

	getLogger(identifier).info(`Successfully connected to ${serverInfo.type} server`);

	if (serverInfo.type === 'stdio') {
		const stdioTransport = transport as StdioClientTransport;
		stdioTransport.stderr?.on('data', (data) => {
			getLogger(identifier).error(`${data.toString()}`);
		});
	}

	existingClient = servers.get(identifier);
	if (existingClient) {
		// Another client was created while we were connecting. Dispose this
		// one quietly so its onclose/onerror handlers don't clobber the
		// status of the healthy client we are about to keep.
		getLogger(identifier).info(`A second client was created while connecting, discarding it.`);
		client.onclose = undefined;
		client.onerror = undefined;
		client.close();
		return existingClient.client;
	}

	if (serverInfo.type === 'streamableHttp') {
		getLogger(identifier).info(`Storing streamableHttp client`);
		servers.set(identifier, { transport: transport as StreamableHTTPClientTransport, client, type: 'streamableHttp', serverInfo });
	} else if (serverInfo.type === 'sse') {
		getLogger(identifier).info(`Storing SSE client`);
		servers.set(identifier, { transport: transport as SSEClientTransport, client, type: 'sse', serverInfo });
	} else {
		getLogger(identifier).info(`Storing stdio client`, identifier);
		servers.set(identifier, { transport: transport as StdioClientTransport, client, type: 'stdio', serverInfo });
	}
	return client;
}

async function createAndConnectTransportFor(identifier: string, serverInfo: MCPServerInfo, client: Client): Promise<StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport> {
	if (serverInfo.type === 'streamableHttp') {
		getLogger(identifier).info(`Creating streamableHttp transport`);
		if (!extensionContext) {
			throw new Error('Extension context is not set');
		}
		const authProvider = new MCPOAuthClientProvider(extensionContext, serverInfo.serverUrl, identifier, (authorizationUrl: URL) => {
			getLogger(identifier).info(`OAuth provider needs auth callback during connection`);
			updateStatus(identifier, { type: 'needsAuth', authorizationUrl: authorizationUrl.href });
		});
		const transport = new StreamableHTTPClientTransport(new URL(serverInfo.serverUrl), {
			authProvider,
			requestInit: {
				headers: {
					'User-Agent': getUserAgent(),
					...(serverInfo.headers ? serverInfo.headers : {}),
				}
			}
		});
		try {
			getLogger(identifier).info(`Connecting to streamableHttp server`);
			await client.connect(transport);
			updateStatus(identifier, { type: 'connected' });
			return transport
		} catch (error) {
			getLogger(identifier).error(`Error connecting to streamableHttp server, falling back to SSE:`, error);
			if (error instanceof UnauthorizedError || (error instanceof Error && error.message.includes('Unauthorized'))) {
				getLogger(identifier).warn(`Unauthorized error connecting to streamableHttp server, returning transport`);
				// Don't set status here - let the auth provider handle it via needsAuthCallback
				// The auth provider will call needsAuthCallback which sets status to 'needsAuth'
				return transport
			}
			// Backwards compatibility is done by detecting a 400 and trying SSE instead
			// https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility
			getLogger(identifier).error(`Error connecting to streamableHttp server, falling back to SSE:`, error);

			let sseTransport: SSEClientTransport | undefined = undefined;
			try {
				sseTransport = new SSEClientTransport(new URL(serverInfo.serverUrl), {
					authProvider,
					requestInit: {
						headers: {
							'User-Agent': getUserAgent(),
							...(serverInfo.headers ? serverInfo.headers : {}),
						}
					}
				});
				getLogger(identifier).info(`Connecting to SSE server`);
				await client.connect(sseTransport);
				updateStatus(identifier, { type: 'connected' });
				return sseTransport;
			} catch (sseError) {
				if (sseTransport && (sseError instanceof UnauthorizedError || (sseError instanceof Error && sseError.message.includes('Unauthorized')))) {
					getLogger(identifier).warn(`Unauthorized error connecting to SSE server, returning transport`);
					// Don't set status here - let the auth provider handle it via needsAuthCallback
					// The auth provider will call needsAuthCallback which sets status to 'needsAuth'
					return sseTransport
				}
				getLogger(identifier).error(`Error connecting to SSE server after fallback:`, sseError);
				updateStatus(identifier, { type: 'error', error: (sseError as Error).message });
				// Explicitly close the client if the fallback also fails, to prevent leaks
				client.close();
				throw sseError; // Re-throw the error after closing the client
			}
		}
	} else if (serverInfo.type === 'stdio') {
		const cursorEnvVars = {
			WORKSPACE_FOLDER_PATHS: vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath).join(',') ?? '',
			// Make npm/npx non-interactive to avoid prompts
			npm_config_yes: 'true',
			NPM_CONFIG_YES: 'true'
		}
		// Expand any ~ in the command path
		const expandedCommand = expandPath(serverInfo.command);

		// Handle separate args if provided, otherwise parse from command for legacy support
		let command: string;
		let args: string[];

		if (serverInfo.args && serverInfo.args.length > 0) {
			// New format with separate command and args
			command = expandedCommand;
			args = serverInfo.args.map(arg => expandPath(arg));
		} else {
			// Legacy format - parse command string to extract args
			const parts = expandedCommand.split(' ');
			command = parts[0];
			args = parts.slice(1);
		}

		getLogger(identifier).info(`Starting new stdio process with command: ${command} ${args.join(' ')}`);

		// Create a clean env object with only defined values
		const cleanEnv: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined) {
				cleanEnv[key] = value;
			}
		}
		let fullPath = os.homedir()
		if (serverInfo.projectPath) {
			// Project path has an index ahead of it like 0-folder-name
			const actualFolderName = serverInfo.projectPath.split('-').slice(1).join('-');
			const folder = vscode.workspace.workspaceFolders?.find(
				f => actualFolderName && f.uri.fsPath.endsWith(actualFolderName)
			);
			if (folder) {
				fullPath = folder.uri.fsPath;
			}
		}
		const transport = new StdioClientTransport({
			cwd: fullPath,
			command: command,
			args: args,
			env: { ...cleanEnv, ...cursorEnvVars, ...serverInfo.env },
			stderr: 'pipe'
		});
		transport.stderr?.on('data', (data) => {
			getLogger(identifier).error(`${data.toString()}`);
		});
		await client.connect(transport);
		updateStatus(identifier, { type: 'connected' });
		return transport;
	}
	throw new Error('Invalid server type');
}

async function getTools(client: Client, identifier: string): Promise<{ name: string, description: string, parameters: string }[]> {
	try {
		const capabilities = client.getServerCapabilities() ?? { tools: false, resources: false };
		if (!capabilities.tools) {
			return [];
		}

		const toolsResult = await client.listTools();
		if (!toolsResult || !toolsResult.tools || !Array.isArray(toolsResult.tools)) {
			McpLogger.error(`Invalid tools response from server: ${JSON.stringify(toolsResult)}`);
			throw new Error('Invalid tools response from server');
		}
		McpLogger.info(`listOfferings: Found ${toolsResult.tools.length} tools`);

		// Clear existing mappings for this server's tools
		toolNameMap.clear();

		return toolsResult.tools.map((tool: Tool) => {
			const schema = tool.inputSchema;
			const sanitizedName = sanitizeToolName(tool.name);
			// Store mapping between sanitized and original name
			toolNameMap.set(sanitizedName, tool.name);

			// Check if schema has no parameters
			const hasNoParams = !schema?.properties || Object.keys(schema.properties).length === 0;

			if (hasNoParams) {
				// Add dummy parameter for empty schemas
				return {
					name: sanitizedName,
					description: tool.description || '',
					parameters: JSON.stringify({
						type: 'object',
						properties: {
						}
					})
				};
			}

			return {
				name: sanitizedName,
				description: tool.description || '',
				parameters: JSON.stringify(tool.inputSchema)
			};
		});
	} catch (error) {
		getLogger(identifier).error(`Error listing tools:`, error);
		return []
	}
}

async function getPrompts(client: Client, identifier: string): Promise<{ name: string, description: string, parameters: string }[]> {
	try {
		const capabilities = client.getServerCapabilities() ?? { prompts: false };
		if (!capabilities.prompts) {
			return [];
		}
		const promptsResult = await client.listPrompts();
		if (!promptsResult || !promptsResult.prompts || !Array.isArray(promptsResult.prompts)) {
			McpLogger.error(`Invalid prompts response from server: ${JSON.stringify(promptsResult)}`);
			return [];
		}
		McpLogger.info(`listPrompts: Found ${promptsResult.prompts.length} prompts`);
		return promptsResult.prompts.map((prompt: MCPTargetPrompt) => {
			// Build a JSON schema description of the prompt arguments
			const schema: { type: 'object'; properties: Record<string, { type: 'string'; description: string }>; required: string[] } = {
				type: 'object',
				properties: {},
				required: []
			};

			if (prompt.arguments && Array.isArray(prompt.arguments)) {
				for (const arg of prompt.arguments as MCPTargetPromptArgument[]) {
					schema.properties[arg.name] = {
						type: 'string',
						description: arg.description || ''
					};
					if (arg.required) {
						schema.required.push(arg.name);
					}
				}
			}

			return {
				name: prompt.name,
				description: prompt.description || '',
				parameters: JSON.stringify(schema)
			};
		});
	} catch (error) {
		getLogger(identifier).error(`Error listing prompts:`, error);
		return []
	}
}

async function getResources(client: Client, identifier: string): Promise<{ uri: string, name?: string, description?: string, mimeType?: string, annotations?: Record<string, unknown> }[]> {
	try {
		const capabilities = client.getServerCapabilities() ?? { resources: false };
		if (!capabilities.resources) {
			return [];
		}
		const resourcesResult = await client.listResources();
		if (!resourcesResult || !resourcesResult.resources || !Array.isArray(resourcesResult.resources)) {
			McpLogger.error(`Invalid resources response from server: ${JSON.stringify(resourcesResult)}`);
			return [];
		}
		McpLogger.info(`listResources: Found ${resourcesResult.resources.length} resources`);
		return resourcesResult.resources.map(resource => ({
			uri: resource.uri,
			name: resource.name,
			description: resource.description,
			mimeType: resource.mimeType,
			annotations: resource.annotations as Record<string, unknown> | undefined
		}));
	} catch (error) {
		getLogger(identifier).error(`Error listing resources:`, error);
		return []
	}
}

async function listOfferings(identifier: string) {
	const serverInstance = servers.get(identifier);
	if (!serverInstance) {
		getLogger(identifier).error(`No server info found`);
		throw new Error('listOfferings: No server info found');
	}

	const serverInfo = serverInstance.serverInfo;
	if (serverInfo.type === 'stdio' && !serverInfo.command) {
		getLogger(identifier).error(`Command is required for stdio servers`);
		throw new Error('listOfferings: Command is required for stdio servers');
	}

	try {
		const client = await getOrCreateClient(identifier, serverInfo);
		getLogger(identifier).info(`Connected to ${serverInfo.type} server, fetching offerings`);

		const tools = await getTools(client, identifier);
		const prompts = await getPrompts(client, identifier);
		const resources = await getResources(client, identifier);

		getLogger(identifier).info(`Found ${tools.length} tools, ${prompts.length} prompts, and ${resources.length} resources`);

		return { tools, prompts, resources };
	} catch (error) {
		getLogger(identifier).error(`Error listing offerings:`, error);
		throw error;
	}
}

async function callTool(identifier: string, name: string, args?: Record<string, unknown>, toolCallId?: string) {
	const serverInstance = servers.get(identifier);
	if (!serverInstance) {
		getLogger(identifier).error(`No server info found`);
		throw new Error('No server info found');
	}

	const serverInfo = serverInstance.serverInfo;

	// Get original tool name from sanitized name
	const originalName = toolNameMap.get(name) || name;

	getLogger(identifier).info(`Calling tool '${originalName}' with toolCallId: ${toolCallId}`);
	if (args) {
		getLogger(identifier).debug(`Tool arguments:`, args);
	}

	try {
		// Set the current toolCallId context for this server
		if (toolCallId) {
			currentToolCallContext.set(identifier, toolCallId);
		}

		const client = await getOrCreateClient(identifier, serverInfo);

		const progressToken = toolCallId
		const result = await client.callTool({
			name: originalName,
			arguments: args,
			_meta: {
				progressToken
			}
		}, CallToolResultSchema, {
			onprogress: (progress: Progress) => {
				getLogger(identifier).info(`ProgressNotification received for ${progressToken}`, progress);
				vscode.commands.executeCommand('mcp.progressNotification', { progressToken, notification: progress });
			},
			// Some MCP tools can take a really long time! Like a deep research tool
			timeout: 60 * 60 * 1000
		});
		getLogger(identifier).info(`Successfully called tool '${originalName}'`);

		// Tool result content can include text, image, and resource types
		// Resource content will be rendered as clickable links in the UI

		// Clear the toolCallId context after successful completion
		if (toolCallId) {
			currentToolCallContext.delete(identifier);
		}

		return { result };
	} catch (error) {
		getLogger(identifier).error(`Error calling tool '${originalName}':`, error);

		// Clear the toolCallId context on error as well
		if (toolCallId) {
			currentToolCallContext.delete(identifier);
		}

		return { result: { error: error.message } };
	}
}

async function getPrompt(identifier: string, name: string, args?: Record<string, unknown>) {
	const serverInstance = servers.get(identifier);
	if (!serverInstance) {
		getLogger(identifier).error(`No server info found`);
		throw new Error('No server info found');
	}

	const serverInfo = serverInstance.serverInfo;

	getLogger(identifier).info(`Getting prompt '${name}'`);
	if (args) {
		getLogger(identifier).debug(`Prompt arguments:`, args);
	}

	try {
		const client = await getOrCreateClient(identifier, serverInfo);

		// Convert args to string values as per MCP protocol, ensuring deterministic behaviour
		const stringArgs: Record<string, string> = {};
		if (args) {
			for (const [key, value] of Object.entries(args)) {
				stringArgs[key] = typeof value === 'string' ? value : JSON.stringify(value);
			}
		}

		const result = await client.getPrompt({
			name,
			arguments: stringArgs
		});

		getLogger(identifier).info(`Successfully retrieved prompt '${name}'`);
		return { result };
	} catch (error) {
		getLogger(identifier).error(`Error getting prompt '${name}':`, error as Error);
		return { result: { error: (error instanceof Error ? error.message : String(error)) } };
	}
}

async function readResource(identifier: string, uri: string) {
	const serverInstance = servers.get(identifier);
	if (!serverInstance) {
		getLogger(identifier).error(`No server info found`);
		throw new Error('No server info found');
	}

	const serverInfo = serverInstance.serverInfo;

	getLogger(identifier).info(`Reading resource: ${uri}`);

	try {
		const client = await getOrCreateClient(identifier, serverInfo);

		const result = await client.readResource({
			uri
		});

		getLogger(identifier).info(`Successfully read resource: ${uri}`);
		return { result };
	} catch (error) {
		getLogger(identifier).error(`Error reading resource '${uri}':`, error as Error);
		return { result: { error: (error instanceof Error ? error.message : String(error)) } };
	}
}

registerAction(MCPActions.CallTool, async (args: { identifier: string, name: string, args: Record<string, unknown>, toolCallId?: string }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling CallTool action for tool '${args.name}'`);
	return callTool(args.identifier, args.name, args.args, args.toolCallId);
});

registerAction(MCPActions.GetPrompt, async (args: { identifier: string, name: string, args?: Record<string, unknown> }, extra: ExtraContext) => {
	McpLogger.info(`${trim(args.identifier)}: Handling GetPrompt action for prompt '${args.name}'`);
	return getPrompt(args.identifier, args.name, args.args);
});

registerAction(MCPActions.ReadResource, async (args: { identifier: string, uri: string }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling ReadResource action for URI '${args.uri}'`);
	return readResource(args.identifier, args.uri);
});

registerAction(MCPActions.CreateClient, async (args: { identifier: string, serverInfo: MCPServerInfo }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling CreateClient action`);
	const client = await getOrCreateClient(args.identifier, args.serverInfo);
	getLogger(args.identifier).info(`CreateClient completed, server stored: ${servers.has(args.identifier)}`);
	return { success: true };
});

registerAction(MCPActions.DeleteClient, async (args: { identifier: string }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling DeleteClient action`);
	cleanupServer(args.identifier);
	return { success: true };
});

registerAction(MCPActions.ListOfferings, async (args: { identifier: string }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling ListOfferings action, server stored: ${servers.has(args.identifier)}`);
	return listOfferings(args.identifier);
});

// Export functions for use in mcpService
export function deleteClient(identifier: string): void {
	cleanupServer(identifier);
}

registerAction(MCPActions.ReloadClient, async (args: { identifier: string, serverInfo: MCPServerInfo }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling ReloadClient action`);

	// Clean up existing client if it exists
	cleanupServer(args.identifier);

	// Create new client with provided server info
	try {
		await getOrCreateClient(args.identifier, args.serverInfo);
		getLogger(args.identifier).info(`Successfully reloaded client`);
		return { success: true };
	} catch (error) {
		getLogger(args.identifier).error(`Failed to reload client:`, error);
		return { success: false };
	}
});

registerAction(MCPActions.LogoutServer, async (args: { identifier: string }, extra: ExtraContext) => {
	getLogger(args.identifier).info(`Handling LogoutServer action`);

	try {
		// Get the OAuth client provider for this server
		const serverUrl: string = extra.context.globalState.get<string>(`[${args.identifier}] ${'mcp_server_url'}`) ?? '';
		if (!serverUrl) {
			// We can still clear secrets/state using the identifier-scoped keys even without a stored server URL
			getLogger(args.identifier).warn(`No stored server URL for logout; proceeding to clear OAuth state using identifier only`);
		}

		const oauthProvider = new MCPOAuthClientProvider(extra.context, serverUrl, args.identifier, (authorizationUrl: URL) => {
			// This is not a provider used for logging in, just for clearing
		});

		// Clear the OAuth tokens
		await oauthProvider.clear();
		getLogger(args.identifier).info(`Successfully cleared OAuth tokens`);

		// Clean up the client and start the reconnection process
		// so the authorize button shows up waiting to be clicked
		cleanupServer(args.identifier);

		return { success: true };
	} catch (error) {
		getLogger(args.identifier).error(`Failed to logout server:`, error);
		return { success: false };
	}
});

registerAction(MCPActions.ClearAllTokens, async (_args: {}, extra: ExtraContext) => {
	McpLogger.info('Handling ClearAllTokens action');

	const cleared: string[] = [];
	const globalStateKeys = extra.context.globalState.keys();

	// Regex to match keys in the format "[identifier] mcp_server_url"
	const serverUrlKeyRegex = /^\[(.+?)\] mcp_server_url$/;

	for (const key of globalStateKeys) {
		const match = key.match(serverUrlKeyRegex);
		if (!match) {
			continue;
		}

		const identifier = match[1];
		const serverUrl = extra.context.globalState.get<string>(key);
		if (!serverUrl) {
			continue;
		}

		try {
			const oauthProvider = new MCPOAuthClientProvider(extra.context, serverUrl, identifier, () => { /* no-op */ });
			await oauthProvider.clear();
			getLogger(identifier).info(`Cleared OAuth tokens`);
			cleared.push(identifier);
		} catch (error) {
			getLogger(identifier).error(`Failed to clear OAuth tokens`, error as Error);
		}

		// Also clean up any running clients for this identifier if present
		cleanupServer(identifier);
	}

	return { success: true, cleared };
});

// Register command to handle elicitation responses from the main process
vscode.commands.registerCommand('mcp.elicitationResponse', (args: { requestId: string, response: any }) => {
	McpLogger.info(`Received elicitation response for request ${args.requestId}:`, args.response);
	const resolve = pendingElicitationRequests.get(args.requestId);
	if (resolve) {
		pendingElicitationRequests.delete(args.requestId);
		McpLogger.info(`Resolving elicitation request ${args.requestId} with response`);
		resolve(args.response);
	} else {
		McpLogger.warn(`No pending elicitation request found for ID: ${args.requestId}. Pending requests:`, Array.from(pendingElicitationRequests.keys()));
	}
});

function trim(identifier: string): string {
	return identifier;
}
