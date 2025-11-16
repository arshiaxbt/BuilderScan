import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserClick = defineBrowserTool({
	name: 'browser_click',
	description: 'Perform click on a web page',
	params: z.object({
		element: z
			.string()
			.describe(
				'Human-readable element description used to obtain permission to interact with the element'
			),
		ref: z
			.string()
			.describe('Exact target element reference from the page snapshot'),
		doubleClick: z
			.boolean()
			.optional()
			.describe('Whether to perform a double click instead of a single click'),
		button: z
			.enum(['left', 'right', 'middle'])
			.optional()
			.describe('Button to click, defaults to left'),
		modifiers: z
			.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift']))
			.optional()
			.describe('Modifier keys to press'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		const locator = tab.page.locator(`aria-ref=${params.ref}`);
		const options = {
			button: params.button,
			modifiers: params.modifiers,
		};

		if (params.doubleClick) {
			response.addCode(
				`await page.locator('aria-ref=${params.ref}').dblclick(${JSON.stringify(options)});`
			);
			await locator.dblclick(options);
		} else {
			response.addCode(
				`await page.locator('aria-ref=${params.ref}').click(${JSON.stringify(options)});`
			);
			await locator.click(options);
		}
	},
});
