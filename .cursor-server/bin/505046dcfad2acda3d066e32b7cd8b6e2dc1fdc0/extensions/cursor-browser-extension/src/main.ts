import { McpProvider } from '@cursor/types';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	BrowserConfig,
	BrowserManager,
	checkPlaywrightStatus,
	listBrowserContexts,
} from './browser-manager.js';
import { browserClick } from './tools/click.js';
import { browserConsoleMessages } from './tools/console.js';
import { browserHandleDialog } from './tools/dialog.js';
import { browserDrag } from './tools/drag.js';
import { browserEvaluate } from './tools/evaluate.js';
import { browserFillForm } from './tools/form.js';
import { browserHover } from './tools/hover.js';
import { browserPressKey, browserType } from './tools/keyboard.js';
import { browserNavigate, browserNavigateBack } from './tools/navigate.js';
import { browserNetworkRequests } from './tools/network.js';
import { browserResize } from './tools/resize.js';
import { browserTakeScreenshot } from './tools/screenshot.js';
import { browserSelectOption } from './tools/select.js';
import { browserSnapshot } from './tools/snapshot.js';
import { browserTabs } from './tools/tabs.js';
import { browserWaitFor } from './tools/wait.js';
import { PlaywrightLogger } from './utils/logger.js';
import { browserToolToMcpTool, createMcpTools } from './utils/mcp-tools.js';

const deactivateTasks: { (): Promise<any> }[] = [];

// MCP Provider that wraps the Playwright MCP Server
class PlaywrightMcpProvider implements McpProvider {
	public readonly id = 'cursor-browser-extension';
	public readonly featureGateName = 'playwright_mcp_provider';

	private browserManager: BrowserManager | null = null;
	private mcpTools: ReturnType<typeof createMcpTools> | null = null;
	private currentConfig: BrowserConfig | null = null;

	// Directory for temporary log files (used for large snapshots)
	private readonly TEMP_LOG_DIR = path.join(
		os.homedir(),
		'.cursor',
		'browser-logs'
	);

	constructor(private extensionContext: vscode.ExtensionContext) { }

	async initialize(): Promise<void> {
		try {
			PlaywrightLogger.info('Initializing Playwright Browser Tools');

			// Clean up old log files from previous sessions
			await this.cleanupOldLogFiles();

			// Load configuration from VS Code storage
			this.currentConfig = this.extensionContext.globalState.get(
				'playwrightConfig',
				{
					connectionType: 'default' as const,
				}
			);

			PlaywrightLogger.info(
				`Using configuration: ${JSON.stringify(this.currentConfig)}`
			);

			// Initialize browser manager with config
			this.browserManager = new BrowserManager(this.currentConfig);

			// Create tools registry with lazy context initialization
			const getContext = async () => {
				if (!this.browserManager) {
					throw new Error('Browser manager not initialized');
				}
				return await this.browserManager.getContext();
			};

			this.mcpTools = createMcpTools({
				browser_navigate: browserToolToMcpTool(browserNavigate, getContext),
				browser_navigate_back: browserToolToMcpTool(
					browserNavigateBack,
					getContext
				),
				browser_resize: browserToolToMcpTool(browserResize, getContext),
				browser_snapshot: browserToolToMcpTool(browserSnapshot, getContext, {
					snapshotSizeThreshold: 200 * 1024, // 200KB - higher limit for snapshot tool
				}),
				browser_wait_for: browserToolToMcpTool(browserWaitFor, getContext),
				browser_press_key: browserToolToMcpTool(browserPressKey, getContext),
				browser_console_messages: browserToolToMcpTool(
					browserConsoleMessages,
					getContext
				),
				browser_network_requests: browserToolToMcpTool(
					browserNetworkRequests,
					getContext
				),
				browser_click: browserToolToMcpTool(browserClick, getContext),
				browser_hover: browserToolToMcpTool(browserHover, getContext),
				browser_type: browserToolToMcpTool(browserType, getContext),
				browser_select_option: browserToolToMcpTool(
					browserSelectOption,
					getContext
				),
				browser_drag: browserToolToMcpTool(browserDrag, getContext),
				browser_evaluate: browserToolToMcpTool(browserEvaluate, getContext),
				browser_fill_form: browserToolToMcpTool(browserFillForm, getContext),
				browser_handle_dialog: browserToolToMcpTool(
					browserHandleDialog,
					getContext
				),
				browser_take_screenshot: browserToolToMcpTool(
					browserTakeScreenshot,
					getContext
				),
				browser_tabs: browserToolToMcpTool(browserTabs, getContext),
			});

			PlaywrightLogger.info(
				'Playwright Browser Tools initialized successfully'
			);
		} catch (error) {
			PlaywrightLogger.error(
				'Failed to initialize Playwright Browser Tools',
				error as Error
			);
			throw error;
		}
	}

	async listOfferings(): Promise<
		{ tools: any[]; prompts: any[]; resources?: any[] } | undefined
	> {
		if (!this.mcpTools) {
			throw new Error('Browser tools not initialized');
		}

		PlaywrightLogger.info('Listing available browser tools');

		try {
			const tools = this.mcpTools.getTools();

			return {
				tools,
				prompts: [],
				resources: [],
			};
		} catch (error) {
			PlaywrightLogger.error('Error listing offerings', error as Error);
			throw error;
		}
	}

	async callTool(
		toolName: string,
		args: Record<string, unknown>
	): Promise<unknown> {
		if (!this.mcpTools) {
			await this.initialize();
		}

		if (!this.mcpTools) {
			throw new Error('Browser tools not initialized');
		}

		try {
			PlaywrightLogger.info(`Calling tool ${toolName}`);
			const result = await this.mcpTools.call(toolName, args);

			PlaywrightLogger.info(`Result: ${JSON.stringify(result, null, 2)}`);

			return result;
		} catch (error) {
			PlaywrightLogger.error(`Error calling tool ${toolName}`, error as Error);
			throw error;
		}
	}

	/**
	 * Cleans up old log files from the temporary directory
	 */
	private async cleanupOldLogFiles(): Promise<void> {
		try {
			// Check if the temp directory exists
			const dirExists = await fs
				.access(this.TEMP_LOG_DIR)
				.then(() => true)
				.catch(() => false);
			if (!dirExists) {
				return;
			}

			const files = await fs.readdir(this.TEMP_LOG_DIR);
			const now = Date.now();
			const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

			for (const file of files) {
				if (file.endsWith('.log')) {
					const filePath = path.join(this.TEMP_LOG_DIR, file);
					try {
						const stats = await fs.stat(filePath);
						if (now - stats.mtimeMs > maxAge) {
							await fs.unlink(filePath);
							PlaywrightLogger.info(`Cleaned up old log file: ${file}`);
						}
					} catch (error) {
						PlaywrightLogger.error(
							`Failed to clean up log file ${file}`,
							error as Error
						);
					}
				}
			}
		} catch (error) {
			PlaywrightLogger.error('Failed to cleanup old log files', error as Error);
		}
	}

	async dispose(): Promise<void> {
		// Dispose browser manager (handles all browser/context cleanup)
		if (this.browserManager) {
			await this.browserManager.dispose();
			this.browserManager = null;
		}

		// Clean up old log files before disposing
		await this.cleanupOldLogFiles();

		this.mcpTools = null;

		PlaywrightLogger.info('Playwright MCP Provider disposed');
	}
}

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {
	PlaywrightLogger.init();
	PlaywrightLogger.info('Activating Cursor Browser Extension MCP Provider');

	// Create and initialize the MCP provider
	const mcpProvider = new PlaywrightMcpProvider(context);

	try {
		await mcpProvider.initialize();
		PlaywrightLogger.info('Cursor Browser Extension MCP Provider initialized successfully');
	} catch (error) {
		PlaywrightLogger.error(
			'Failed to initialize Cursor Browser Extension MCP Provider',
			error as Error
		);
		// Still register the provider even if initialization fails - it can retry later
	}

	const mcpDisposable = vscode.cursor.registerMcpProvider(mcpProvider);

	// Register the status command
	const statusCommand = vscode.commands.registerCommand(
		'cursor-browser-extension.status',
		checkPlaywrightStatus
	);

	// Register the list contexts command
	const listContextsCommand = vscode.commands.registerCommand(
		'cursor-browser-extension.listContexts',
		listBrowserContexts
	);

	// Register command to update configuration
	const updateConfigCommand = vscode.commands.registerCommand(
		'cursor-browser-extension.updateConfig',
		async (config: any) => {
			PlaywrightLogger.info(
				`Updating configuration: ${JSON.stringify(config)}`
			);
			await context.globalState.update('playwrightConfig', config);
			// Reinitialize to apply new configuration
			try {
				await mcpProvider.dispose();
				await mcpProvider.initialize();
				PlaywrightLogger.info(
					'Successfully reinitialized with new configuration'
				);
			} catch (error) {
				PlaywrightLogger.error(
					'Failed to reinitialize with new configuration',
					error as Error
				);
			}
		}
	);

	deactivateTasks.push(async () => {
		await mcpProvider.dispose();
		mcpDisposable.dispose();
		statusCommand.dispose();
		listContextsCommand.dispose();
		updateConfigCommand.dispose();
	});

	PlaywrightLogger.info(
		'Cursor Browser Extension MCP Provider registered successfully'
	);
}

export async function deactivate(): Promise<void> {
	PlaywrightLogger.info('Deactivating Cursor Browser Extension MCP Provider');

	for (const task of deactivateTasks) {
		await task();
	}
}
