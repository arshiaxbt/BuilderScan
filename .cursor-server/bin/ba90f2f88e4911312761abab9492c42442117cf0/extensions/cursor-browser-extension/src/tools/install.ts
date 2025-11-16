import z from 'zod';
import { defineBrowserTool } from '../utils/browser-tool.js';
import { fork } from 'child_process';
import * as path from 'path';

export const browserInstall = defineBrowserTool({
	name: 'browser_install',
	description: 'Install the browser specified in the config. Call this if you get an error about the browser not being installed.',
	params: z.object({}),

	handle: async (context, params, response) => {
		const channel = 'chrome';
		const cliPath = path.join(require.resolve('playwright/package.json'), '../cli.js');
		const child = fork(cliPath, ['install', channel], {
			stdio: 'pipe',
		});
		const output: string[] = [];

		if (child.stdout) {
			child.stdout.on('data', data => output.push(data.toString()));
		}
		if (child.stderr) {
			child.stderr.on('data', data => output.push(data.toString()));
		}

		await new Promise<void>((resolve, reject) => {
			child.on('close', code => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Failed to install browser: ${output.join('')}`));
				}
			});
		});

		response.setIncludeTabs();
		response.addResult('Browser installed successfully');
	},
});

