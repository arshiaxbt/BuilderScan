import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserWaitFor = defineBrowserTool({
	name: 'browser_wait_for',
	description: 'Wait for text to appear or disappear or a specified time to pass',
	params: z.object({
		time: z.number().optional().describe('The time to wait in seconds'),
		text: z.string().optional().describe('The text to wait for'),
		textGone: z.string().optional().describe('The text to wait for to disappear'),
	}),

	handle: async (context, params, response) => {
		if (!params.text && !params.textGone && !params.time) {
			throw new Error('Either time, text or textGone must be provided');
		}

		if (params.time) {
			response.addCode(`await new Promise(f => setTimeout(f, ${params.time!} * 1000));`);
			await new Promise(f => setTimeout(f, Math.min(30000, params.time! * 1000)));
		}

		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		const locator = params.text ? tab.page.getByText(params.text).first() : undefined;
		const goneLocator = params.textGone ? tab.page.getByText(params.textGone).first() : undefined;

		if (goneLocator) {
			response.addCode(`await page.getByText(${JSON.stringify(params.textGone)}).first().waitFor({ state: 'hidden' });`);
			await goneLocator.waitFor({ state: 'hidden' });
		}

		if (locator) {
			response.addCode(`await page.getByText(${JSON.stringify(params.text)}).first().waitFor({ state: 'visible' });`);
			await locator.waitFor({ state: 'visible' });
		}

		response.addResult(`Waited for ${params.text || params.textGone || params.time}`);
		response.setIncludeSnapshot();
	},
});

