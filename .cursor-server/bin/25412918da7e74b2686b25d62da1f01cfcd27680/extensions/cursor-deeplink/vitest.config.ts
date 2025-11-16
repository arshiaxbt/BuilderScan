import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		deps: {
			// Mock external modules that can't be imported in the test environment
			inline: ['vscode']
		},
		globals: true,
	},
});
