import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserResize = defineBrowserTool({
	name: 'browser_resize',
	description: 'Resize the browser window',
	params: z.object({
		width: z.number().describe('Width of the browser window'),
		height: z.number().describe('Height of the browser window'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.addCode(`await page.setViewportSize({ width: ${params.width}, height: ${params.height} });`);

		await tab.page.setViewportSize({ width: params.width, height: params.height });
	},
});

