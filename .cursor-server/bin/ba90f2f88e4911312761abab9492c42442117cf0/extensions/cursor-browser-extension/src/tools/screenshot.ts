import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

/**
 * Generate a filename with timestamp
 */
function dateAsFileName(extension: string): string {
	const now = new Date();
	return `page-${now
		.toISOString()
		.replace(/[:.]/g, '-')
		.replace(/T/, '-')
		.replace(/\.\d+Z$/, '')}.${extension}`;
}

export const browserTakeScreenshot = defineBrowserTool({
	name: 'browser_take_screenshot',
	description:
		"Take a screenshot of the current page. You can't perform actions based on the screenshot, use browser_snapshot for actions.",
	params: z.object({
		type: z
			.enum(['png', 'jpeg'])
			.default('png')
			.describe('Image format for the screenshot. Default is png.'),
		filename: z
			.string()
			.optional()
			.describe(
				'File name to save the screenshot to. Defaults to `page-{timestamp}.{png|jpeg}` if not specified.'
			),
		element: z
			.string()
			.optional()
			.describe(
				'Description of a specific element to screenshot (if omitted, screenshots the page)'
			),
		ref: z
			.string()
			.optional()
			.describe(
				'CSS selector of a specific element to screenshot (if omitted, screenshots the page)'
			),
		fullPage: z
			.boolean()
			.optional()
			.describe(
				'When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport.'
			),
	}),

	handle: async (context, params, response) => {
		await context.ensureTab();

		const fileType = params.type || 'png';
		const fileName = await context.outputFile(
			params.filename ?? dateAsFileName(fileType)
		);

		// Get the current tab
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		let buffer: Buffer;
		let screenshotTarget: string;

		// If ref is provided, screenshot the specific element
		if (params.ref) {
			const locator = tab.page.locator(params.ref);
			const screenshotOptions = {
				type: fileType,
				quality: fileType === 'png' ? undefined : 90,
				path: fileName,
			};

			screenshotTarget = params.element || params.ref;
			response.addCode(`// Screenshot element: ${screenshotTarget}`);
			response.addCode(
				`await page.locator('${params.ref}').screenshot(${JSON.stringify(screenshotOptions, null, 2)});`
			);
			buffer = (await locator.screenshot(screenshotOptions)) as Buffer;
		} else {
			// Screenshot the page
			const screenshotOptions = {
				type: fileType,
				quality: fileType === 'png' ? undefined : 90,
				path: fileName,
				...(params.fullPage !== undefined && { fullPage: params.fullPage }),
			};

			screenshotTarget = params.fullPage ? 'full page' : 'viewport';
			response.addCode(
				`// Screenshot ${screenshotTarget} and save it as ${fileName}`
			);
			response.addCode(
				`await page.screenshot(${JSON.stringify(screenshotOptions, null, 2)});`
			);
			buffer = (await tab.page.screenshot(screenshotOptions)) as Buffer;
		}

		response.addResult(
			`Took the ${screenshotTarget} screenshot and saved it as ${fileName}`
		);

		// Only return image data for viewport screenshots (not full page)
		// https://github.com/microsoft/playwright-mcp/issues/817
		if (!params.fullPage) {
			response.addImage({
				contentType: fileType === 'png' ? 'image/png' : 'image/jpeg',
				data: buffer,
			});
		}
	},
});
