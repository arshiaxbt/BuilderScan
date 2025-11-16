import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserFillForm = defineBrowserTool({
	name: 'browser_fill_form',
	description: 'Fill multiple form fields',
	params: z.object({
		fields: z
			.array(
				z.object({
					name: z.string().describe('Description of the field'),
					ref: z.string().describe('CSS selector for the field'),
					type: z
						.enum(['textbox', 'checkbox', 'radio', 'combobox', 'slider'])
						.describe('Type of the field'),
					value: z
						.string()
						.describe(
							'Value to fill in the field. If the field is a checkbox, the value should be `true` or `false`. If the field is a combobox, the value should be the text of the option.'
						),
				})
			)
			.describe('Fields to fill in'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		for (const field of params.fields) {
			const locator = tab.page.locator(field.ref);

			if (field.type === 'textbox' || field.type === 'slider') {
				await locator.fill(field.value);
				response.addCode(
					`await page.locator('${field.ref}').fill('${field.value}');`
				);
			} else if (field.type === 'checkbox' || field.type === 'radio') {
				const isChecked = field.value === 'true';
				await locator.setChecked(isChecked);
				response.addCode(
					`await page.locator('${field.ref}').setChecked(${isChecked});`
				);
			} else if (field.type === 'combobox') {
				await locator.selectOption({ label: field.value });
				response.addCode(
					`await page.locator('${field.ref}').selectOption('${field.value}');`
				);
			}
		}

		response.setIncludeSnapshot();
	},
});
