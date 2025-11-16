import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserTabs = defineBrowserTool({

	name: 'browser_tabs',
	description: 'List, create, close, or select a browser tab.',
	params: z.object({
		action: z.enum(['list', 'new', 'close', 'select']).describe('Operation to perform'),
		index: z.number().optional().describe('Tab index, used for close/select. If omitted for close, current tab is closed.'),
	}),

	handle: async (context, params, response) => {
		switch (params.action) {
			case 'list': {
				await context.ensureTab();
				response.setIncludeTabs();
				return;
			}
			case 'new': {
				await context.newTab();
				response.setIncludeTabs();
				return;
			}
			case 'close': {
				await context.closeTab(params.index);
				response.setIncludeSnapshot();
				return;
			}
			case 'select': {
				if (params.index === undefined)
					throw new Error('Tab index is required');
				await context.selectTab(params.index);
				response.setIncludeSnapshot();
				return;
			}
		}
	},
});