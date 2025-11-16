import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserSnapshot = defineBrowserTool({
	name: 'browser_snapshot',
	description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
	params: z.object({}),

	handle: async (context, params, response) => {
		await context.ensureTab();
		response.setIncludeSnapshot();
	},
});

