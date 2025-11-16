import type { BrowserContext, Page, Request, ConsoleMessage as PlaywrightConsoleMessage, Dialog, FileChooser } from 'playwright-core';
import type { BrowserToolContext } from './browser-tool.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

export type ConsoleMessage = {
	type: ReturnType<PlaywrightConsoleMessage['type']> | undefined;
	text: string;
	toString(): string;
};

export type ModalState =
	| { type: 'dialog'; dialog: Dialog }
	| { type: 'fileChooser'; fileChooser: FileChooser };

function messageToConsoleMessage(message: PlaywrightConsoleMessage): ConsoleMessage {
	return {
		type: message.type(),
		text: message.text(),
		toString: () => `[${message.type().toUpperCase()}] ${message.text()} @ ${message.location().url}:${message.location().lineNumber}`,
	};
}

function pageErrorToConsoleMessage(errorOrValue: Error | any): ConsoleMessage {
	if (errorOrValue instanceof Error) {
		return {
			type: 'error',
			text: errorOrValue.message,
			toString: () => errorOrValue.stack || errorOrValue.message,
		};
	}
	return {
		type: 'error',
		text: String(errorOrValue),
		toString: () => String(errorOrValue),
	};
}

export class Tab {
	readonly page: Page;
	index: number;
	private _requests: Set<Request> = new Set();
	private _consoleMessages: ConsoleMessage[] = [];
	private _recentConsoleMessages: ConsoleMessage[] = [];
	private _modalStates: ModalState[] = [];
	private _initializedPromise: Promise<void>;
	private _onPageClose: (tab: Tab) => void;

	constructor(page: Page, index: number, onPageClose: (tab: Tab) => void) {
		this.page = page;
		this.index = index;
		this._onPageClose = onPageClose;
		page.on('request', (request: Request) => this._requests.add(request));
		page.on('console', (event: PlaywrightConsoleMessage) => this._handleConsoleMessage(messageToConsoleMessage(event)));
		page.on('pageerror', (error: Error) => this._handleConsoleMessage(pageErrorToConsoleMessage(error)));
		page.on('dialog', (dialog: Dialog) => this._handleDialog(dialog));
		page.on('filechooser', (fileChooser: FileChooser) => this._handleFileChooser(fileChooser));
		page.on('close', () => this._onClose());
		this._initializedPromise = this._initialize();
	}

	private async _initialize(): Promise<void> {
		const requests = await this.page.requests().catch(() => []);
		for (const request of requests) {
			this._requests.add(request);
		}

		// Collect existing console messages
		const messages = await this.page.consoleMessages().catch(() => []);
		for (const message of messages) {
			this._handleConsoleMessage(messageToConsoleMessage(message));
		}
		const errors = await this.page.pageErrors().catch(() => []);
		for (const error of errors) {
			this._handleConsoleMessage(pageErrorToConsoleMessage(error));
		}
	}

	private _clearCollectedArtifacts(): void {
		this._requests.clear();
		this._consoleMessages.length = 0;
		this._recentConsoleMessages.length = 0;
	}

	private _handleConsoleMessage(message: ConsoleMessage): void {
		this._consoleMessages.push(message);
		this._recentConsoleMessages.push(message);
	}

	private _handleDialog(dialog: Dialog): void {
		this._modalStates.push({ type: 'dialog', dialog });
	}

	private _handleFileChooser(fileChooser: FileChooser): void {
		this._modalStates.push({ type: 'fileChooser', fileChooser });
	}

	private _onClose(): void {
		this._clearCollectedArtifacts();
		this._onPageClose(this);
	}

	async requests(): Promise<Set<Request>> {
		await this._initializedPromise;
		return this._requests;
	}

	async consoleMessages(type?: 'error'): Promise<ConsoleMessage[]> {
		await this._initializedPromise;
		return this._consoleMessages.filter(message => type ? message.type === type : true);
	}

	modalStates(): ModalState[] {
		return this._modalStates;
	}

	clearModalState(state: ModalState): void {
		const index = this._modalStates.indexOf(state);
		if (index !== -1) {
			this._modalStates.splice(index, 1);
		}
	}

	async navigate(url: string): Promise<void> {
		this._clearCollectedArtifacts();

		try {
			await this.page.goto(url, { waitUntil: 'domcontentloaded' });
		} catch (e) {
			// Handle potential download scenarios or other navigation errors
			throw e;
		}

		// Cap load event to 5 seconds, the page is operational at this point
		await this.page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
	}

	async goBack(): Promise<void> {
		this._clearCollectedArtifacts();
		await this.page.goBack();
	}
}

export class Context implements BrowserToolContext {
	private _tabs: Tab[] = [];
	private _currentTab: Tab | undefined;
	private _outputDir: string;

	constructor(private browserContext: BrowserContext) {
		// Create output directory for screenshots and other files
		this._outputDir = path.join(os.tmpdir(), 'cursor-browser-extension', Date.now().toString());
		// Register existing pages
		for (const page of browserContext.pages()) {
			this._onPageCreated(page);
		}

		// Listen for new pages
		browserContext.on('page', (page) => this._onPageCreated(page));
	}

	private _onPageCreated(page: Page) {
		const tab = new Tab(page, this._tabs.length, (t) => this._onPageClosed(t));
		this._tabs.push(tab);
		if (!this._currentTab) {
			this._currentTab = tab;
		}
	}

	private _onPageClosed(tab: Tab) {
		const index = this._tabs.indexOf(tab);
		if (index === -1) return;

		this._tabs.splice(index, 1);

		// Reindex remaining tabs
		for (let i = index; i < this._tabs.length; i++) {
			this._tabs[i]!.index = i;
		}

		// Update current tab if needed
		if (this._currentTab === tab) {
			this._currentTab = this._tabs[Math.min(index, this._tabs.length - 1)];
		}
	}

	tabs(): Tab[] {
		return this._tabs;
	}

	currentTab(): Tab | undefined {
		return this._currentTab;
	}

	currentTabOrDie(): Tab {
		if (!this._currentTab) {
			throw new Error('No open pages available. Use the "browser_navigate" tool to navigate to a page first.');
		}
		return this._currentTab;
	}

	async ensureTab(): Promise<void> {
		if (!this._currentTab) {
			await this.browserContext.newPage();
		}
	}

	async newTab(): Promise<void> {
		const page = await this.browserContext.newPage();
		this._currentTab = this._tabs.find(t => t.page === page);
	}

	async closeTab(index?: number): Promise<void> {
		const tab = index === undefined ? this._currentTab : this._tabs[index];
		if (!tab) {
			throw new Error(`Tab ${index} not found`);
		}
		await tab.page.close();
	}

	async selectTab(index: number): Promise<void> {
		const tab = this._tabs[index];
		if (!tab) {
			throw new Error(`Tab ${index} not found`);
		}
		await tab.page.bringToFront();
		this._currentTab = tab;
	}

	async navigate(url: string): Promise<void> {
		const tab = this.currentTabOrDie();
		await tab.navigate(url);
	}

	async goBack(): Promise<void> {
		const tab = this.currentTabOrDie();
		await tab.goBack();
	}

	async outputFile(fileName: string): Promise<string> {
		// Ensure output directory exists
		await fs.mkdir(this._outputDir, { recursive: true });
		return path.join(this._outputDir, fileName);
	}

	async dispose(): Promise<void> {
		// Close all pages
		await Promise.all(this._tabs.map(tab => tab.page.close().catch(() => { })));
		this._tabs = [];
		this._currentTab = undefined;
	}
}

