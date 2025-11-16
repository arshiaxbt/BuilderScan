import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';
import type { Request } from 'playwright-core';

export const browserNetworkRequests = defineBrowserTool({
	name: 'browser_network_requests',
	description: 'Returns all network requests since loading the page',
	params: z.object({}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		const requests = await tab.requests();
		for (const request of requests)
			response.addResult(await renderRequest(request));
	},
});

async function renderRequest(request: Request) {
	const result: string[] = [];
	result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
	const hasResponse = (request as any)._hasResponse;
	if (hasResponse) {
		const response = await request.response();
		if (response)
			result.push(`=> [${response.status()}] ${response.statusText()}`);
	}
	return result.join(' ');
}
