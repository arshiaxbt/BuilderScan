import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserPressKey = defineBrowserTool({
	name: 'browser_press_key',
	description: 'Press a key on the keyboard',
	params: z.object({
		key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();
		response.addCode(`// Press ${params.key}`);
		response.addCode(`await page.keyboard.press('${params.key}');`);

		await tab.page.keyboard.press(params.key);
	},
});

export const browserType = defineBrowserTool({
	name: 'browser_type',
	description: 'Type text into editable element',
	params: z.object({
		element: z
			.string()
			.describe(
				'Human-readable element description used to obtain permission to interact with the element'
			),
		ref: z
			.string()
			.describe('Exact target element reference from the page snapshot'),
		text: z.string().describe('Text to type into the element'),
		submit: z
			.boolean()
			.optional()
			.describe('Whether to submit entered text (press Enter after)'),
		slowly: z
			.boolean()
			.optional()
			.describe(
				'Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.'
			),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		// Use aria-ref locator matching Playwright's snapshot system
		const locator = tab.page.locator(`aria-ref=${params.ref}`);

		// TODO: Implement secret management for sensitive data
		// For now, use the text directly
		const text = params.text;

		if (params.slowly) {
			response.setIncludeSnapshot();
			response.addCode(
				`await page.locator('aria-ref=${params.ref}').pressSequentially('${text}');`
			);
			await locator.pressSequentially(text);
		} else {
			response.addCode(
				`await page.locator('aria-ref=${params.ref}').fill('${text}');`
			);
			await locator.fill(text);
		}

		if (params.submit) {
			response.setIncludeSnapshot();
			response.addCode(
				`await page.locator('aria-ref=${params.ref}').press('Enter');`
			);
			await locator.press('Enter');
		}
	},
});

