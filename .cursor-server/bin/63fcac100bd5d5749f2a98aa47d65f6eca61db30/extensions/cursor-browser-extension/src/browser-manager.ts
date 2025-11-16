import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Browser, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { PlaywrightLogger } from './utils/logger.js';
import { Context } from './utils/context.js';

export type BrowserConfig =
	| { connectionType: 'default' }
	| { connectionType: 'executable'; executablePath: string }
	| { connectionType: 'cdp'; cdpUrl: string; selectedContextId?: string }
	| { connectionType: 'self' };

/**
 * Determines the Chrome executable path for the current platform
 * @returns Chrome executable path or undefined if not found
 */
export async function getChromeExecutablePath(): Promise<string | undefined> {
	const platform = os.platform();
	const possiblePaths: string[] = [];

	switch (platform) {
		case 'darwin': // macOS
			possiblePaths.push(
				'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
				'/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
				'/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
				'/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
				'/Applications/Chromium.app/Contents/MacOS/Chromium'
			);
			break;

		case 'win32': {
			// Windows
			const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
			const programFilesX86 =
				process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
			const localAppData =
				process.env['LOCALAPPDATA'] ||
				path.join(os.homedir(), 'AppData', 'Local');

			possiblePaths.push(
				path.join(
					programFiles,
					'Google',
					'Chrome',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFilesX86,
					'Google',
					'Chrome',
					'Application',
					'chrome.exe'
				),
				path.join(
					localAppData,
					'Google',
					'Chrome',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFiles,
					'Google',
					'Chrome Beta',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFilesX86,
					'Google',
					'Chrome Beta',
					'Application',
					'chrome.exe'
				),
				path.join(
					localAppData,
					'Google',
					'Chrome Beta',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFiles,
					'Google',
					'Chrome Dev',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFilesX86,
					'Google',
					'Chrome Dev',
					'Application',
					'chrome.exe'
				),
				path.join(
					localAppData,
					'Google',
					'Chrome Dev',
					'Application',
					'chrome.exe'
				),
				// NB: Chrome Canary (uses SxS = Side-by-Side directory still)
				path.join(
					programFiles,
					'Google',
					'Chrome SxS',
					'Application',
					'chrome.exe'
				),
				path.join(
					programFilesX86,
					'Google',
					'Chrome SxS',
					'Application',
					'chrome.exe'
				),
				path.join(
					localAppData,
					'Google',
					'Chrome SxS',
					'Application',
					'chrome.exe'
				),
				// Chromium builds
				path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
				path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'),
				path.join(localAppData, 'Chromium', 'Application', 'chrome.exe')
			);
			break;
		}

		case 'linux': // Linux
			possiblePaths.push(
				'/usr/bin/google-chrome',
				'/usr/bin/google-chrome-stable',
				'/usr/bin/google-chrome-beta',
				'/usr/bin/google-chrome-unstable',
				'/usr/bin/chromium-browser',
				'/usr/bin/chromium',
				'/snap/bin/chromium',
				'/var/lib/snapd/snap/bin/chromium',
				'/usr/local/bin/chrome',
				'/usr/local/bin/google-chrome'
			);
			break;

		default:
			PlaywrightLogger.warn(`Unsupported platform: ${platform}`);
			return undefined;
	}

	// Check each possible path and return the first one that exists
	for (const executablePath of possiblePaths) {
		try {
			if (
				await fs
					.access(executablePath)
					.then(() => true)
					.catch(() => false)
			) {
				PlaywrightLogger.info(`Found Chrome executable at: ${executablePath}`);
				return executablePath;
			}
		} catch (error) {
			// Continue to next path if there's an error checking this one
			continue;
		}
	}

	PlaywrightLogger.warn(
		`No Chrome executable found on ${platform}. Checked paths: ${possiblePaths.join(
			', '
		)}`
	);
	return undefined;
}

/**
 * Attempts to fetch the WebSocket CDP URL exposed by Cursor itself.
 *
 * The function is defensive because `fetch` is not guaranteed to be available
 * in all Node.js versions that VS Code extensions may run on. It therefore
 * falls back to dynamically importing `node-fetch` when necessary. A timeout
 * and a small retry loop are introduced to make the network call more robust
 * and avoid hanging the extension activation when the endpoint is
 * unavailable.
 */
export async function getSelfCdpUrl(): Promise<string> {
	// Prefer the global implementation if present; otherwise, defer-load
	// `node-fetch`. The dynamic import keeps the dependency optional and
	// avoids breaking in environments where `node-fetch` is not installed.
	// The cast prevents TypeScript from losing type information.
	const fetchImplementation: typeof fetch =
		typeof fetch === 'function'
			? fetch
			: ((await import('node-fetch')) as unknown as { default: typeof fetch })
				.default;

	const maxRetries = 2;
	const timeoutMs = 3_000;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImplementation(
				'http://localhost:9222/json/version',
				{ signal: controller.signal }
			);

			if (!response.ok) {
				throw new Error(
					`Failed to fetch CDP version info: ${response.status} ${response.statusText}`
				);
			}

			const data: unknown = await response.json();

			if (
				typeof data === 'object' &&
				data !== null &&
				'webSocketDebuggerUrl' in data &&
				typeof (data as { webSocketDebuggerUrl: unknown })
					.webSocketDebuggerUrl === 'string'
			) {
				return (data as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
			}

			throw new Error(
				'`webSocketDebuggerUrl` is missing or not a string in response'
			);
		} catch (error) {
			const isLastAttempt = attempt === maxRetries;
			PlaywrightLogger.warn(
				`Attempt ${attempt + 1} to fetch self CDP URL failed: ${(error as Error).message}`
			);

			if (isLastAttempt) {
				PlaywrightLogger.error(
					'Failed to retrieve self CDP URL after retries',
					error as Error
				);
				throw error;
			}

			// Brief backoff before retrying to avoid hammering the endpoint.
			await new Promise((resolve) => setTimeout(resolve, 500));
		} finally {
			clearTimeout(timeout);
		}
	}

	// This point should be unreachable because the loop either returns or
	// throws, but TypeScript requires a return.
	throw new Error('Unexpected error fetching self CDP URL');
}

/**
 * Lists available browser contexts from a CDP connection
 */
export async function listBrowserContexts(
	cdpUrl: string
): Promise<Array<{ id: string; pages: number }>> {
	try {
		// Connect to the browser to get contexts
		const browser = await chromium.connectOverCDP(cdpUrl);
		const contexts = browser.contexts();

		const contextInfo = await Promise.all(
			contexts.map(async (ctx) => {
				const pages = ctx.pages();
				return {
					id: (ctx as any)._guid || 'unknown',
					pages: pages.length,
				};
			})
		);

		// Disconnect without closing the browser
		await browser.close();

		return contextInfo;
	} catch (error) {
		PlaywrightLogger.error('Error listing browser contexts', error as Error);
		return [];
	}
}

/**
 * Manager for browser and context lifecycle
 */
export class BrowserManager {
	private browserContext: BrowserContext | null = null;
	private toolContext: Context | null = null;
	private activeBrowsers: Set<Browser> = new Set();
	private persistentContextDir: string | null = null;

	constructor(private config: BrowserConfig) { }

	/**
	 * Gets the browser context, initializing it lazily if needed
	 */
	async getContext(): Promise<Context> {
		// Check if we have a valid context that's still open
		if (this.browserContext && this.toolContext) {
			try {
				// Test if the context is still valid by checking pages
				// This will throw if the context is closed
				this.browserContext.pages();
				return this.toolContext;
			} catch (error) {
				// Context is closed, clear references and reinitialize
				PlaywrightLogger.info('Detected closed context, reinitializing');
				this.browserContext = null;
				this.toolContext = null;
			}
		}

		PlaywrightLogger.info('Lazily initializing browser context');

		let browser: Browser;

		if (this.config.connectionType === 'self') {
			// Connect to Cursor's own CDP endpoint
			const selfCdpUrl = await getSelfCdpUrl();
			PlaywrightLogger.info(`Connecting to self CDP at ${selfCdpUrl}`);
			browser = await chromium.connectOverCDP(selfCdpUrl);

			// Track the browser instance for proper cleanup
			this.activeBrowsers.add(browser);

			// Listen for browser close events to remove from tracking
			browser.on('disconnected', () => {
				this.activeBrowsers.delete(browser);
				PlaywrightLogger.info('Browser disconnected and removed from tracking, clearing context references');
				this.browserContext = null;
				if (this.toolContext) {
					this.toolContext.dispose().catch(err =>
						PlaywrightLogger.error('Error disposing tool context', err)
					);
					this.toolContext = null;
				}
			});

			// Reuse the first existing context or create a fresh one
			if (browser.contexts().length > 0) {
				this.browserContext = browser.contexts()[0];
				PlaywrightLogger.info('Using first available context from self');
			} else {
				this.browserContext = await browser.newContext();
				PlaywrightLogger.info(
					'No existing context found – created new context in self mode'
				);
			}

			// Listen for context close events
			this.browserContext.on('close', async () => {
				PlaywrightLogger.info('Browser context closed, clearing references');
				this.browserContext = null;
				if (this.toolContext) {
					await this.toolContext.dispose();
					this.toolContext = null;
				}
			});
		} else if (this.config.connectionType === 'cdp') {
			// Connect to existing browser via CDP
			PlaywrightLogger.info(`Connecting to CDP at ${this.config.cdpUrl}`);
			browser = await chromium.connectOverCDP(this.config.cdpUrl);

			// Track the browser instance for proper cleanup
			this.activeBrowsers.add(browser);

			// Listen for browser close events to remove from tracking
			browser.on('disconnected', () => {
				this.activeBrowsers.delete(browser);
				PlaywrightLogger.info('Browser disconnected and removed from tracking, clearing context references');
				this.browserContext = null;
				if (this.toolContext) {
					this.toolContext.dispose().catch(err =>
						PlaywrightLogger.error('Error disposing tool context', err)
					);
					this.toolContext = null;
				}
			});

			// Get the specified context or create a new one
			const selectedContextId = this.config.connectionType === 'cdp' ? this.config.selectedContextId : undefined;
			if (selectedContextId) {
				// Find the existing context by ID
				const existingContext = browser
					.contexts()
					.find((ctx) => (ctx as any)._guid === selectedContextId);
				if (existingContext) {
					PlaywrightLogger.info(
						`Using existing context: ${selectedContextId}`
					);
					this.browserContext = existingContext;
				} else {
					PlaywrightLogger.warn(
						`Context ${selectedContextId} not found, using first available or creating new`
					);
					this.browserContext =
						browser.contexts()[0] ?? (await browser.newContext());
				}
			} else {
				// Use first available context or create new
				this.browserContext =
					browser.contexts()[0] ?? (await browser.newContext());
				PlaywrightLogger.info('Using first available context or created new');
			}

			// Listen for context close events
			this.browserContext.on('close', async () => {
				PlaywrightLogger.info('Browser context closed, clearing references');
				this.browserContext = null;
				if (this.toolContext) {
					await this.toolContext.dispose();
					this.toolContext = null;
				}
			});
		} else {
			// Launch new browser with persistent context (custom or default executable)
			const executablePath =
				this.config.connectionType === 'executable'
					? this.config.executablePath
					: await getChromeExecutablePath();

			PlaywrightLogger.info(
				`Launching browser with persistent context, executable: ${executablePath || 'bundled'}`
			);

			// Create a temporary directory for this session's persistent context
			this.persistentContextDir = path.join(
				os.tmpdir(),
				`cursor-browser-extension-session-${Date.now()}`
			);
			await fs.mkdir(this.persistentContextDir, { recursive: true });

			const launchOptions: Parameters<
				typeof chromium.launchPersistentContext
			>[1] = {
				headless: false,
				viewport: null,
				args: [
					// Ensure extensions are enabled (don't disable them)
					'--enable-extensions',
				],
			};

			if (executablePath) {
				launchOptions.channel = undefined;
				launchOptions.executablePath = executablePath;
			} else {
				// Use bundled Chrome if available
				launchOptions.channel = 'chrome';
			}

			// Launch with persistent context to preserve session data
			this.browserContext = await chromium.launchPersistentContext(
				this.persistentContextDir,
				launchOptions
			);

			// Get the browser instance from the context for tracking
			const contextBrowser = this.browserContext.browser();
			if (contextBrowser) {
				this.activeBrowsers.add(contextBrowser);

				// Listen for browser close events to remove from tracking
				contextBrowser.on('disconnected', () => {
					if (contextBrowser) {
						this.activeBrowsers.delete(contextBrowser);
					}
					PlaywrightLogger.info(
						'Browser disconnected and removed from tracking, clearing context references'
					);
					this.browserContext = null;
					if (this.toolContext) {
						this.toolContext.dispose().catch(err =>
							PlaywrightLogger.error('Error disposing tool context', err)
						);
						this.toolContext = null;
					}
				});
			}

			// Listen for context close events
			this.browserContext.on('close', async () => {
				PlaywrightLogger.info('Browser context closed, clearing references and closing browser');
				try {
					const browser = this.browserContext?.browser();
					if (browser) {
						await browser.close();
						this.activeBrowsers.delete(browser);
					}
				} catch (error) {
					PlaywrightLogger.error(
						'Error closing browser on context close',
						error as Error
					);
				}

				// Clear references
				this.browserContext = null;
				if (this.toolContext) {
					await this.toolContext.dispose();
					this.toolContext = null;
				}
			});

			PlaywrightLogger.info(
				`Persistent context created at: ${this.persistentContextDir}`
			);
		}

		// Create Context wrapper
		this.toolContext = new Context(this.browserContext);
		return this.toolContext;
	}

	/**
	 * Disposes of all browser resources
	 */
	async dispose(): Promise<void> {
		// Dispose context wrapper
		if (this.toolContext) {
			await this.toolContext.dispose();
			this.toolContext = null;
		}

		// Close browser context (important for persistent contexts)
		if (this.browserContext) {
			try {
				PlaywrightLogger.info('Closing browser context');
				await this.browserContext.close();
				PlaywrightLogger.info('Browser context closed successfully');
			} catch (error) {
				PlaywrightLogger.error('Error closing browser context', error as Error);
			}
			this.browserContext = null;
		}

		// Close all active browsers
		if (this.activeBrowsers.size > 0) {
			PlaywrightLogger.info(
				`Closing ${this.activeBrowsers.size} active browser(s)`
			);
			const closeBrowserPromises = Array.from(this.activeBrowsers).map(
				async (browser) => {
					try {
						await browser.close();
						PlaywrightLogger.info('Browser closed successfully');
					} catch (error) {
						PlaywrightLogger.error('Error closing browser', error as Error);
					}
				}
			);
			await Promise.allSettled(closeBrowserPromises);
			this.activeBrowsers.clear();
		}

		// Clean up persistent context directory
		if (this.persistentContextDir) {
			try {
				PlaywrightLogger.info(
					`Cleaning up persistent context directory: ${this.persistentContextDir}`
				);
				await fs.rm(this.persistentContextDir, {
					recursive: true,
					force: true,
				});
				PlaywrightLogger.info('Persistent context directory cleaned up');
			} catch (error) {
				PlaywrightLogger.error(
					'Error cleaning up persistent context directory',
					error as Error
				);
			}
			this.persistentContextDir = null;
		}
	}
}

/**
 * Checks and returns the current Playwright browser status
 */
export async function checkPlaywrightStatus(): Promise<object> {
	const chromePath = await getChromeExecutablePath();
	return {
		platform: os.platform(),
		chromeFound: !!chromePath,
		chromePath: chromePath || 'bundled',
	};
}

