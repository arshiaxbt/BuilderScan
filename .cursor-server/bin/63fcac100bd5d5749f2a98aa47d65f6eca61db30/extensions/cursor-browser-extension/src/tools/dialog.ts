import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';

export const browserHandleDialog = defineBrowserTool({
	name: 'browser_handle_dialog',
	description: 'Handle a dialog (alert, confirm, prompt)',
	params: z.object({
		accept: z.boolean().describe('Whether to accept the dialog.'),
		promptText: z.string().optional().describe('The text of the prompt in case of a prompt dialog.'),
	}),

	handle: async (context, params, response) => {
		const tab = context.currentTab();
		if (!tab) {
			throw new Error('No active tab available');
		}

		response.setIncludeSnapshot();

		// Find dialog in modal states
		const dialogState = tab.modalStates().find(state => state.type === 'dialog');
		if (!dialogState) {
			throw new Error('No dialog visible');
		}

		// Clear the modal state
		tab.clearModalState(dialogState);

		// Handle the dialog
		if (dialogState.type === 'dialog') {
			if (params.accept) {
				await dialogState.dialog.accept(params.promptText);
				response.addCode(`await dialog.accept(${params.promptText ? `'${params.promptText}'` : ''});`);
			} else {
				await dialogState.dialog.dismiss();
				response.addCode(`await dialog.dismiss();`);
			}
		}
	},
});

