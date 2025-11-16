import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserSelectOption = defineBrowserTool({
	name: 'browser_select_option',
	description: 'Select an option in a dropdown',
	params: z.object({
		element: z
			.string()
			.describe(
				'Human-readable element description used to obtain permission to interact with the element'
			),
		ref: z
			.string()
			.describe('Exact target element reference from the page snapshot'),
		values: z
			.array(z.string())
			.describe(
				'Array of values to select in the dropdown. This can be a single value or multiple values.'
			),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		const locator = tab.page.locator(`aria-ref=${params.ref}`);
		response.addCode(
			`await page.locator('aria-ref=${params.ref}').selectOption(${JSON.stringify(params.values)});`
		);

		await locator.selectOption(params.values);
	},
});
