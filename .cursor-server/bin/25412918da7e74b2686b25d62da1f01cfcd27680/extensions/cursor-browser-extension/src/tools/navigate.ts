import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';
import { PlaywrightLogger } from '../utils/logger.js';

export const browserNavigate = defineBrowserTool({
	name: 'browser_navigate',
	description: 'Navigate to a URL',
	params: z.object({
		url: z.string().describe('The URL to navigate to'),
	}),

	handle: async (context, params, response) => {
		// Validate URL to reject file:// URLs for security reasons
		const parsedUrl = new URL(params.url);

		if (parsedUrl.protocol === 'file:') {
			const message = `Security restriction: file:// URLs are not allowed for security reasons. The browser_navigate tool can only access web URLs (http:// or https://). If you need to test with local files, consider using a local web server instead.`;
			PlaywrightLogger.warn(
				`Blocked file:// URL navigation attempt: ${params.url}`
			);
			throw new Error(message);
		}

		await context.ensureTab();
		await context.navigate(params.url);
		response.setIncludeSnapshot();
	},
});

export const browserNavigateBack = defineBrowserTool({
	name: 'browser_navigate_back',
	description: 'Go back to the previous page',
	params: z.object({}),

	handle: async (context, params, response) => {
		await context.ensureTab();
		await context.goBack();
		response.setIncludeSnapshot();
	},
});

