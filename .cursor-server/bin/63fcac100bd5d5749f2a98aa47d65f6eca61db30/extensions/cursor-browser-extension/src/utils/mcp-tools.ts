import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { BrowserTool } from './browser-tool.js';
import type { BrowserContext } from 'playwright-core';
import { Context } from './context.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Configuration for large snapshot handling
const SNAPSHOT_SIZE_THRESHOLD = 25 * 1024; // 50KB threshold for snapshots
const SNAPSHOT_PREVIEW_LINES = 50; // Number of lines to preview
const TEMP_LOG_DIR = path.join(os.homedir(), '.cursor', 'browser-logs');

/**
 * Writes a large snapshot to a file and returns a preview with file reference
 */
async function writeSnapshotToFile(
	snapshot: string
): Promise<{ filePath: string; previewLines: string[]; totalLines: number }> {
	await fs.mkdir(TEMP_LOG_DIR, { recursive: true });

	// Generate a unique filename for the snapshot file
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const fileName = `snapshot-${timestamp}.log`;
	const filePath = path.join(TEMP_LOG_DIR, fileName);

	// Calculate total lines and get preview lines
	const lines = snapshot.split('\n');
	const totalLines = lines.length;
	const previewLines = lines.slice(0, Math.min(SNAPSHOT_PREVIEW_LINES, totalLines));

	// Write the snapshot content to the file
	await fs.writeFile(filePath, snapshot, 'utf8');

	console.info(
		`Large snapshot redirected to: ${filePath} (${totalLines} lines, ${previewLines.length} preview lines)`
	);

	return { filePath, previewLines, totalLines };
}

type ToolSpecBase = {
	description: string;
	params?: z.ZodTypeAny;
};

type ToolImplFor<Spec extends ToolSpecBase> = (
	params: Spec['params'] extends z.ZodTypeAny ? z.infer<Spec['params']> : void
) => unknown | Promise<unknown>;

export type ToolDefsWithImpl<T extends Record<string, ToolSpecBase>> = {
	[K in keyof T]: T[K] & { impl: ToolImplFor<T[K]> };
};


export function createMcpTools<T extends Record<string, ToolSpecBase>>(
	defs: ToolDefsWithImpl<T>
) {
	const handlers = new Map<string, (params: unknown) => Promise<unknown>>();

	for (const [name, spec] of Object.entries(defs) as [
		string,
		ToolSpecBase & { impl: ToolImplFor<ToolSpecBase> },
	][]) {
		handlers.set(name, async (params: unknown) => {
			try {
				let parsedParams = params;
				if (spec.params) {
					const res = spec.params.safeParse(params);
					if (!res.success) {
						throw new Error(`Invalid params: ${res.error.message}`);
					}
					parsedParams = res.data;
				}

				const result = await (
					spec.impl as (p: unknown) => Promise<unknown> | unknown
				)(parsedParams);
				return result as unknown;
			} catch (error) {
				console.error(
					`Error calling tool ${name}: ${error instanceof Error ? error.message : String(error)}`
				);
				throw new Error(
					`Error calling tool ${name}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		});
	}

	function getTools(): {
		name: string;
		description: string;
		parameters: string;
	}[] {
		return Object.entries(defs).map(([name, spec]) => {
			// Convert zod schema to JSON schema format
			let schema: any = { type: 'object', properties: {}, required: [] };

			if (spec.params) {
				// Use zod-to-json-schema to convert Zod schema to JSON Schema
				schema = zodToJsonSchema(spec.params, {
					target: 'openApi3',
					$refStrategy: 'none',
				});
			}

			return {
				name,
				description: spec.description,
				parameters: JSON.stringify(schema),
			};
		});
	}

	async function call(name: string, args: unknown): Promise<unknown> {
		const handler = handlers.get(name);
		if (!handler) {
			throw new Error(`Unknown tool: ${name}`);
		}
		return handler(args);
	}

	return { getTools, call };
}

/**
 * Converts a BrowserTool into an MCP tool definition by injecting a browser context.
 * @param browserTool The browser tool to convert
 * @param getContext A function that returns the Context to use when calling the tool
 * @param options Optional configuration for the tool conversion
 * @param options.snapshotSizeThreshold Custom size threshold for snapshots (defaults to SNAPSHOT_SIZE_THRESHOLD)
 * @returns An MCP tool definition compatible with createMcpTools
 */
export function browserToolToMcpTool<InputT>(
	browserTool: BrowserTool<InputT>,
	getContext: () => Context | Promise<Context>,
	options?: { snapshotSizeThreshold?: number }
): ToolSpecBase & { impl: ToolImplFor<ToolSpecBase> } {
	return {
		description: browserTool.description,
		params: browserTool.params,
		impl: async (params) => {
			const context = await getContext();

			// Create response object to capture post-processing flags
			const responseData: {
				includeTabs?: boolean;
				includeSnapshot?: boolean;
				code?: string[];
				result?: string[];
				images?: Array<{ contentType: string; data: Buffer }>;
			} = {};
			const response = {
				setIncludeTabs: () => {
					responseData.includeTabs = true;
				},
				setIncludeSnapshot: () => {
					responseData.includeSnapshot = true;
				},
				addCode: (code: string) => {
					if (!responseData.code) responseData.code = [];
					responseData.code.push(code);
				},
				addResult: (result: string) => {
					if (!responseData.result) responseData.result = [];
					responseData.result.push(result);
				},
				addImage: (image: { contentType: string; data: Buffer }) => {
					if (!responseData.images) responseData.images = [];
					responseData.images.push(image);
				},
				getData: () => responseData,
			};

			// Call the browser tool - Context already implements BrowserToolContext
			await browserTool.handle(context, params as InputT, response);

			// Build MCP-compatible response
			const content: Array<{
				type: string;
				text?: string;
				data?: string;
				mimeType?: string;
			}> = [];
			const textParts: string[] = [];

			// Add result messages
			if (responseData.result && responseData.result.length > 0) {
				textParts.push(responseData.result.join('\n'));
			}

			// Add code if present
			if (responseData.code && responseData.code.length > 0) {
				textParts.push(
					'\nCode:\n```javascript\n' + responseData.code.join('\n') + '\n```'
				);
			}

			// Add snapshot if present
			if (responseData.includeSnapshot) {
				const currentTab = context.currentTab();
				if (currentTab) {
					try {
						const url = currentTab.page.url();
						const title = await currentTab.page.title();

						// Generate accessibility tree snapshot like Playwright MCP does
						let ariaSnapshot: string;
						try {
							// Use Playwright's internal _snapshotForAI method
							ariaSnapshot = await (currentTab.page as any)._snapshotForAI({
								timeout: 5000,
							});
						} catch (e: unknown) {
							// Fallback if _snapshotForAI is not available
							ariaSnapshot = 'Accessibility snapshot not available';
						}

						// Check if snapshot is too large and should be written to file
						const snapshotSize = Buffer.byteLength(ariaSnapshot, 'utf8');
						const sizeThreshold =
							options?.snapshotSizeThreshold ?? SNAPSHOT_SIZE_THRESHOLD;
						if (snapshotSize > sizeThreshold) {
							const { filePath, previewLines, totalLines } =
								await writeSnapshotToFile(ariaSnapshot);

							textParts.push(
								`\n\n### Page state`,
								`- Page URL: ${url}`,
								`- Page Title: ${title}`,
								`- Page Snapshot: Large snapshot (${snapshotSize} bytes, ${totalLines} lines) written to file`,
								`- Snapshot File: [${filePath}](file://${filePath})`,
								`- Preview (first ${previewLines.length} lines):`,
								'```yaml',
								previewLines.join('\n'),
								'```',
								`\n... (${totalLines - previewLines.length} more lines in file)`
							);
						} else {
							textParts.push(
								`\n\n### Page state`,
								`- Page URL: ${url}`,
								`- Page Title: ${title}`,
								`- Page Snapshot:`,
								'```yaml',
								ariaSnapshot,
								'```'
							);
						}
					} catch (error: unknown) {
						// Execution context may be destroyed after navigation
						// Just skip adding the snapshot info in this case
						console.warn(
							'Could not get page info for snapshot:',
							error instanceof Error ? error.message : String(error)
						);
					}
				}
			}

			// Add tabs if present
			if (responseData.includeTabs) {
				const tabs = context.tabs();
				const tabsText =
					'\n\nOpen tabs:\n' +
					tabs.map((tab, i) => `[${i}] ${tab.page.url()}`).join('\n');
				textParts.push(tabsText);
			}

			// Add text content if we have any
			if (textParts.length > 0) {
				content.push({
					type: 'text',
					text: textParts.join('\n'),
				});
			}

			// Add images with correct MCP format
			if (responseData.images && responseData.images.length > 0) {
				for (const img of responseData.images) {
					content.push({
						type: 'image',
						data: img.data.toString('base64'),
						mimeType: img.contentType,
					});
				}
			}

			// If no content, add a success message
			if (content.length === 0) {
				content.push({
					type: 'text',
					text: 'Operation completed successfully',
				});
			}

			return { content };
		},
	};
}
