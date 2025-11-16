import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserEvaluate = defineBrowserTool({
	name: 'browser_evaluate',
	description: 'Evaluate JavaScript expression on page or element',
	params: z.object({
		function: z
			.string()
			.describe(
				'() => { /* code */ } or (element) => { /* code */ } when element/ref is provided'
			),
		element: z
			.string()
			.optional()
			.describe('Description of the element, if evaluating on an element'),
		ref: z
			.string()
			.optional()
			.describe('CSS selector to find element, if evaluating on an element'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		if (params.ref && params.element) {
			const locator = tab.page.locator(params.ref);
			response.addCode(
				`await page.locator('${params.ref}').evaluate(${params.function});`
			);
			// Use internal _evaluateFunction method like the original
			const result = await (locator as any)._evaluateFunction(params.function);
			response.addResult(JSON.stringify(result, null, 2) || 'undefined');
		} else {
			response.addCode(`await page.evaluate(${params.function});`);
			// Use internal _evaluateFunction method like the original
			const result = await (tab.page as any)._evaluateFunction(params.function);
			response.addResult(JSON.stringify(result, null, 2) || 'undefined');
		}
	},
});
