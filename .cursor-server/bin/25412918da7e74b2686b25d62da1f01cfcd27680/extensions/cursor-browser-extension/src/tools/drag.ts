import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserDrag = defineBrowserTool({
	name: 'browser_drag',
	description: 'Perform drag and drop between two elements',
	params: z.object({
		startElement: z
			.string()
			.describe(
				'Human-readable source element description used to obtain the permission to interact with the element'
			),
		startRef: z
			.string()
			.describe('Exact source element reference from the page snapshot'),
		endElement: z
			.string()
			.describe(
				'Human-readable target element description used to obtain the permission to interact with the element'
			),
		endRef: z
			.string()
			.describe('Exact target element reference from the page snapshot'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		const startLocator = tab.page.locator(`aria-ref=${params.startRef}`);
		const endLocator = tab.page.locator(`aria-ref=${params.endRef}`);

		await startLocator.dragTo(endLocator);

		response.addCode(
			`await page.locator('aria-ref=${params.startRef}').dragTo(page.locator('aria-ref=${params.endRef}'));`
		);
	},
});
