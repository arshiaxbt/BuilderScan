import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserHover = defineBrowserTool({
	name: 'browser_hover',
	description: 'Hover over element on page',
	params: z.object({
		element: z
			.string()
			.describe(
				'Human-readable element description used to obtain permission to interact with the element'
			),
		ref: z
			.string()
			.describe('Exact target element reference from the page snapshot'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		const locator = tab.page.locator(`aria-ref=${params.ref}`);
		response.addCode(`await page.locator('aria-ref=${params.ref}').hover();`);

		await locator.hover();
	},
});
