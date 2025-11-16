import { McpProvider } from '@cursor/types';
import { Server } from 'http';
import * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import { createMcpTools } from './mcp-tools';
import { RPCClient, type NotificationHandlers } from './rpc-client';
import { clientMethods, serverNotifications, type ClientMethods, type ServerNotifications } from './rpc-methods';

// Type alias for our specific RPC client
// IMPORTANT: The generic parameters are confusing here
// First param (TClientMethods): methods/notifications THIS side handles (server notifications for us)
// Second param (TServerMethods): methods the OTHER side implements (so ClientMethods for us)
type BrowserClient = RPCClient<ServerNotifications, ClientMethods>;

/**
 * High-level interface for managing a browser client
 */
class BrowserClientManager {
	private client: BrowserClient;
	private activeTabTitle: string = 'Unknown Tab';
	private activeTabUrl: string = '';
	private readonly id: string;
	private readonly connectedAt: Date;

	constructor(client: BrowserClient, id: string) {
		this.client = client;
		this.id = id;
		this.connectedAt = new Date();
	}

	getClient(): BrowserClient {
		return this.client;
	}

	getId(): string {
		return this.id;
	}

	getActiveTabTitle(): string {
		return this.activeTabTitle;
	}

	getActiveTabUrl(): string {
		return this.activeTabUrl;
	}

	setActiveTabData(title: string, url: string): void {
		this.activeTabTitle = title;
		this.activeTabUrl = url;
	}

	getDisplayName(): string {
		return this.activeTabTitle || `Client ${this.id}`;
	}

	close(): void {
		this.client.close();
	}
}

/**
 * MCP Provider for Browser Connect extension
 */
class BrowserConnectMcpProvider implements McpProvider {
	public readonly id = 'cursor-browser-connect';
	public readonly featureGateName = "browser_connect";

	private tools = createMcpTools({
		get_clients: {
			description: 'Get a list of all connected browser clients with their active tab information',
			impl: () => this.getClients(),
		},
		capture_browser_snapshot: {
			description: 'Capture an accessibility snapshot of the active tab in the browser. Returns a YAML-like tree structure showing all accessible elements, their roles, names, and attributes.',
			impl: () => this.captureBrowserSnapshot(),
		},
	});

	constructor(private context: vscode.ExtensionContext) {
	}

	private getClients(): { clients: Array<{ id: string; activeTabTitle: string; activeTabUrl: string; displayName: string }>; count: number; serverStatus: string } {
		const clients = Array.from(clientManagers.entries()).map(([id, manager]) => ({
			id,
			activeTabTitle: manager.getActiveTabTitle(),
			activeTabUrl: manager.getActiveTabUrl(),
			displayName: manager.getDisplayName(),
		}));
		return {
			clients,
			count: clients.length,
			serverStatus: wsServer ? 'running' : 'stopped',
		};
	}

	private async captureBrowserSnapshot(): Promise<unknown> {
		const firstClient = clientManagers.values().next().value as BrowserClientManager | undefined;
		if (!firstClient) {
			throw new Error('No browser clients connected. Please ensure the Chrome extension is installed and connected.');
		}
		const result = await firstClient.getClient().call.captureSnapshot();
		return {
			snapshot: result.snapshot,
			url: result.url,
		};
	}

	async listOfferings(): Promise<
		{ tools: any[]; prompts: any[]; resources?: any[] } | undefined
	> {
		return {
			tools: this.tools.offerings(),
			prompts: [],
			resources: [],
		};
	}

	async callTool(
		toolName: string,
		args: Record<string, unknown>,
		toolCallId?: string
	): Promise<unknown> {
		return this.tools.call(toolName, args);
	}

	async dispose(): Promise<void> {
		// Nothing to dispose - we don't own the server or clients
	}
}

// Global state
let wsServer: WebSocketServer | null = null;
let httpServer: Server | null = null;
const clientManagers = new Map<string, BrowserClientManager>();
let clientCounter = 0;
let mcpProvider: BrowserConnectMcpProvider | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
const onClientsChangedEmitter = new vscode.EventEmitter<number>();
const onClientsChanged = onClientsChangedEmitter.event;

const DEFAULT_PORT = 8765;
// Removed getVersion; version/name constants no longer needed

/**
 * Create server notification handlers
 */
function createServerNotificationHandlers(manager: BrowserClientManager): NotificationHandlers<ServerNotifications> {
	return {
		updateActiveData(params: { title: string; url: string }) {
			manager.setActiveTabData(params.title, params.url);
		},
	};
}

/**
 * Start the WebSocket server
 */
async function startServer(context: vscode.ExtensionContext): Promise<void> {
	if (wsServer) {
		vscode.window.showInformationMessage('WebSocket server is already running');
		return;
	}

	try {
		httpServer = new Server();
		wsServer = new WebSocketServer({
			server: httpServer,
			path: '/rpc'
		});

		wsServer.on('connection', (ws: WebSocket, request) => {
			const clientId = `client-${clientCounter++}`;
			// Create client manager first (needed for handlers)
			let manager: BrowserClientManager | null = null;

			// Create typed RPC client
			// IMPORTANT: The RPCClient constructor parameters are from ITS perspective:
			// - clientMethods = methods THIS instance implements (so for server, that's serverMethods)
			// - serverMethods = methods the OTHER side implements (so for server, that's clientMethods)
			const client = new RPCClient<ServerNotifications, ClientMethods>(
				ws,
				clientId,
				serverNotifications,  // Notifications THIS side (server/VS Code) handles
				clientMethods   // Methods the OTHER side (browser) implements
			);

			// Create the manager with the client
			manager = new BrowserClientManager(client, clientId);

			// IMPORTANT: Register handlers BEFORE adding to map or processing any messages
			// This ensures handlers are available immediately when messages arrive
			client.registerNotificationHandlers(createServerNotificationHandlers(manager));

			// Now add to the map
			clientManagers.set(clientId, manager);
			onClientsChangedEmitter.fire(clientManagers.size);
			ws.on('close', (code, reason) => {
				clientManagers.delete(clientId);
				onClientsChangedEmitter.fire(clientManagers.size);
			});

			ws.on('error', (error) => {
				console.error(`[Server] WebSocket error for client ${clientId}:`, error);
			});
		});

		httpServer.listen(DEFAULT_PORT, () => {
			vscode.window.showInformationMessage(`RPC server started on port ${DEFAULT_PORT}`);
		});


	} catch (error) {
		console.error('[Server] Failed to start:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to start RPC server: ${errorMessage}`);
	}
}

/**
 * Stop the WebSocket server
 */
async function stopServer(): Promise<void> {
	// Close all clients
	for (const manager of clientManagers.values()) {
		manager.close();
	}
	clientManagers.clear();
	onClientsChangedEmitter.fire(clientManagers.size);

	// Close servers
	if (wsServer) {
		await new Promise<void>((resolve) => {
			wsServer?.close(() => resolve());
		});
		wsServer = null;
	}

	if (httpServer) {
		await new Promise<void>((resolve) => {
			httpServer?.close(() => resolve());
		});
		httpServer = null;
	}
	vscode.window.showInformationMessage('RPC server stopped');
}

const DISABLE_BROWSER_CONNECT = true;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {

	if (DISABLE_BROWSER_CONNECT) {
		return;
	}

	// Register a command to manually close all browsers
	// Create and register the MCP provider
	mcpProvider = new BrowserConnectMcpProvider(context);

	// Register the MCP provider with Cursor
	const mcpDisposable = vscode.cursor.registerMcpProvider(mcpProvider);
	context.subscriptions.push(mcpDisposable);

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.name = 'Browser Connect Clients';
	context.subscriptions.push(statusBarItem);
	const updateStatusBar = () => {
		if (!statusBarItem) return;
		const count = clientManagers.size;
		statusBarItem.text = `$(globe) ${count}`;
		statusBarItem.tooltip = 'Connected browser clients';
		statusBarItem.show();
	};
	updateStatusBar();
	context.subscriptions.push(onClientsChanged((_count) => updateStatusBar()));

	// Auto-start server
	startServer(context);
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
	// Dispose of the MCP provider
	if (mcpProvider) {
		await mcpProvider.dispose();
		mcpProvider = null;
	}

	await stopServer();
}

// Export for testing or external use
export { BrowserClientManager, BrowserConnectMcpProvider, clientManagers, type BrowserClient };
