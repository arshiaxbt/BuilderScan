import z from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { defineBrowserTool } from '../utils/browser-tool.js';

const TEMP_LOG_DIR = path.join(os.homedir(), '.cursor', 'browser-logs');
const CONSOLE_SIZE_THRESHOLD = 25 * 1024; // 25KB threshold for console logs
const CONSOLE_PREVIEW_LINES = 50; // Number of lines to preview

/**
 * Writes console logs to a file and returns metadata
 */
async function writeConsoleLogsToFile(
	consoleContent: string
): Promise<{ filePath: string; previewLines: string[]; totalLines: number }> {
	await fs.mkdir(TEMP_LOG_DIR, { recursive: true });

	// Generate a unique filename for the console logs file
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const fileName = `console-${timestamp}.log`;
	const filePath = path.join(TEMP_LOG_DIR, fileName);

	// Calculate total lines and get preview lines
	const lines = consoleContent.split('\n');
	const totalLines = lines.length;
	const previewLines = lines.slice(0, Math.min(CONSOLE_PREVIEW_LINES, totalLines));

	// Write the console logs content to the file
	await fs.writeFile(filePath, consoleContent, 'utf8');

	console.info(
		`Console logs written to: ${filePath} (${totalLines} lines, ${previewLines.length} preview lines)`
	);

	return { filePath, previewLines, totalLines };
}

export const browserConsoleMessages = defineBrowserTool({
	name: 'browser_console_messages',
	description: 'Returns all console messages',
	params: z.object({}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		const messages = await tab.consoleMessages();

		// Format all console messages
		const formattedMessages = messages.map(message => message.toString());
		const consoleContent = formattedMessages.join('\n');

		// Check if console output is too large and should be written to file
		const consoleSize = Buffer.byteLength(consoleContent, 'utf8');

		if (consoleSize > CONSOLE_SIZE_THRESHOLD) {
			// Write to file and provide a preview
			const { filePath, previewLines, totalLines } =
				await writeConsoleLogsToFile(consoleContent);

			const url = tab.page.url();
			const title = await tab.page.title().catch(() => 'Unknown');

			const fileUrl = pathToFileURL(filePath).href;
			response.addResult(
				`### Console Logs\n` +
				`- Page URL: ${url}\n` +
				`- Page Title: ${title}\n` +
				`- Total Messages: ${messages.length}\n` +
				`- Console Output: Large console output (${consoleSize} bytes, ${totalLines} lines) written to file\n` +
				`- Console Log File: [${filePath}](${fileUrl})\n` +
				`- Preview (first ${previewLines.length} lines):\n` +
				`\`\`\`\n${previewLines.join('\n')}\n\`\`\`\n` +
				`\n... (${totalLines - previewLines.length} more lines in file)`
			);
		} else {
			// Return console messages directly if small enough
			formattedMessages.forEach(message => response.addResult(message));
		}
	},
});
