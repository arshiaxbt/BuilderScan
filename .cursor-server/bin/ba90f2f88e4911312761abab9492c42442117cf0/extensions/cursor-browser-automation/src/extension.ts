import * as vscode from 'vscode';
import { CursorIDEBrowserLogger } from './logger.js';
import { MCPPrompt, McpProvider, MCPResource, MCPTool } from '@cursor/types';
import { BrowserTools } from './browserTools.js';
import { generateBrowserUIScript } from './browserUIScript.js';

class BrowserAutomationMcpProvider implements McpProvider {
	public readonly id = 'cursor-ide-browser';
	public readonly featureGateName = undefined;

	private readonly tools: MCPTool[] = [
		{
			name: 'browser_navigate',
			description: 'Navigate to a URL',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					url: { type: 'string', description: 'The URL to navigate to' }
				},
				required: ['url']
			})
		},
		{
			name: 'browser_snapshot',
			description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
			parameters: JSON.stringify({
				type: 'object',
				properties: {},
				required: []
			})
		},
		{
			name: 'browser_click',
			description: 'Perform click on a web page',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
					ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
					doubleClick: { type: 'boolean', description: 'Whether to perform a double click instead of a single click' },
					button: { type: 'string', description: 'Button to click, defaults to left' },
					modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys to press' }
				},
				required: ['element', 'ref']
			})
		},
		{
			name: 'browser_type',
			description: 'Type text into editable element',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
					ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
					text: { type: 'string', description: 'Text to type into the element' },
					submit: { type: 'boolean', description: 'Whether to submit entered text (press Enter after)' },
					slowly: { type: 'boolean', description: 'Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.' }
				},
				required: ['element', 'ref', 'text']
			})
		},
		{
			name: 'browser_hover',
			description: 'Hover over element on page',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
					ref: { type: 'string', description: 'Exact target element reference from the page snapshot' }
				},
				required: ['element', 'ref']
			})
		},
		{
			name: 'browser_select_option',
			description: 'Select an option in a dropdown',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
					ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
					values: { type: 'array', items: { type: 'string' }, description: 'Array of values to select in the dropdown. This can be a single value or multiple values.' }
				},
				required: ['element', 'ref', 'values']
			})
		},
		{
			name: 'browser_press_key',
			description: 'Press a key on the keyboard',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					key: { type: 'string', description: 'Name of the key to press or a character to generate, such as ArrowLeft or a' }
				},
				required: ['key']
			})
		},
		{
			name: 'browser_wait_for',
			description: 'Wait for text to appear or disappear or a specified time to pass',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					time: { type: 'number', description: 'The time to wait in seconds' },
					text: { type: 'string', description: 'The text to wait for' },
					textGone: { type: 'string', description: 'The text to wait for to disappear' }
				},
				required: []
			})
		},
		{
			name: 'browser_navigate_back',
			description: 'Go back to the previous page',
			parameters: JSON.stringify({
				type: 'object',
				properties: {},
				required: []
			})
		},
		{
			name: 'browser_resize',
			description: 'Resize the browser window',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					width: { type: 'number', description: 'Width of the browser window' },
					height: { type: 'number', description: 'Height of the browser window' }
				},
				required: ['width', 'height']
			})
		},
		{
			name: 'browser_console_messages',
			description: 'Returns all console messages',
			parameters: JSON.stringify({
				type: 'object',
				properties: {},
				required: []
			})
		},
		{
			name: 'browser_network_requests',
			description: 'Returns all network requests since loading the page',
			parameters: JSON.stringify({
				type: 'object',
				properties: {},
				required: []
			})
		},
		{
			name: 'browser_take_screenshot',
			description: 'Take a screenshot of the current page. You can\'t perform actions based on the screenshot, use browser_snapshot for actions.',
			parameters: JSON.stringify({
				type: 'object',
				properties: {
					type: { type: 'string', description: 'Image format for the screenshot. Default is png.' },
					filename: { type: 'string', description: 'File name to save the screenshot to. Defaults to page-{timestamp}.{png|jpeg} if not specified.' },
					element: { type: 'string', description: 'Description of the element, if taking a screenshot of an element' },
					ref: { type: 'string', description: 'CSS selector for the element, if taking a screenshot of an element' },
					fullPage: { type: 'boolean', description: 'When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots.' }
				},
				required: []
			})
		}
	];

	async initialize(): Promise<void> {
		CursorIDEBrowserLogger.info('Browser Automation MCP Provider initialized with direct execution');
	}

	async listOfferings(): Promise<{ tools: MCPTool[]; prompts: MCPPrompt[]; resources?: MCPResource[] }> {
		return {
			tools: this.tools,
			prompts: [],
			resources: []
		};
	}

	async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
		CursorIDEBrowserLogger.info(`Executing tool: ${toolName} with args: ${JSON.stringify(args)}`);

		try {
			switch (toolName) {
				case 'browser_navigate':
					return await BrowserTools.navigate(args as { url: string });
				case 'browser_snapshot':
					return await BrowserTools.snapshot(args);
				case 'browser_click':
					return await BrowserTools.click(args as any);
				case 'browser_type':
					return await BrowserTools.type(args as any);
				case 'browser_hover':
					return await BrowserTools.hover(args as any);
				case 'browser_select_option':
					return await BrowserTools.selectOption(args as any);
				case 'browser_press_key':
					return await BrowserTools.pressKey(args as { key: string });
				case 'browser_wait_for':
					return await BrowserTools.waitFor(args as any);
				case 'browser_navigate_back':
					return await BrowserTools.goBack(args);
				case 'browser_resize':
					return await BrowserTools.resize(args as { width: number; height: number });
				case 'browser_console_messages':
					return await BrowserTools.consoleMessages(args);
				case 'browser_network_requests':
					return await BrowserTools.networkRequests(args);
				case 'browser_take_screenshot':
					return await BrowserTools.takeScreenshot(args as any);
				default:
					throw new Error(`Unknown tool: ${toolName}`);
			}
		} catch (error) {
			CursorIDEBrowserLogger.error(`Error executing tool ${toolName}:`, error);
			throw error;
		}
	}

	async dispose(): Promise<void> {
		CursorIDEBrowserLogger.info('Browser Automation MCP Provider disposed');
	}
}

let mcpProvider: BrowserAutomationMcpProvider | undefined;

async function injectBrowserUIScript(): Promise<void> {
	try {
		const script = generateBrowserUIScript('browser-tab-id');
		await vscode.commands.executeCommand('cursor.browserView.executeJavaScript', script);
		CursorIDEBrowserLogger.info('Browser UI script injected successfully');
	} catch (error) {
		CursorIDEBrowserLogger.error('Failed to inject browser UI script:', error);
	}
}

export async function activate(context: vscode.ExtensionContext) {
	CursorIDEBrowserLogger.init();
	CursorIDEBrowserLogger.info('Cursor Browser Automation extension activated');

	mcpProvider = new BrowserAutomationMcpProvider();
	await mcpProvider.initialize();

	const mcpDisposable = vscode.cursor.registerMcpProvider(mcpProvider);
	context.subscriptions.push(mcpDisposable);

	// Register command to re-inject UI script
	const reinjectCommand = vscode.commands.registerCommand(
		'cursor.browserAutomation.reinjectUIScript',
		injectBrowserUIScript
	);
	context.subscriptions.push(reinjectCommand);

	// Initial injection attempt
	// Note: This may fail if browser view hasn't been created yet, which is fine
	// The script will be injected when BrowserEditorContent calls the command
	injectBrowserUIScript().catch(() => {
		// Silently ignore - browser view may not exist yet
	});
}

export async function deactivate() {
	if (mcpProvider) {
		await mcpProvider.dispose();
		mcpProvider = undefined;
	}
}