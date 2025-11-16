import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		testTimeout: 30000,
	},
	resolve: {
		alias: {
			'vscode': path.resolve(__dirname, '../test-utils/vscodeMock.ts'),
			'@cursor/types': path.resolve(__dirname, '../../src/vs/platform/reactivestorage/common/reactiveStorageTypes'),
			'@cursor/experiment-config': path.resolve(__dirname, '../../src/vs/platform/experiments/common/experimentConfig.gen'),
			'proto': path.resolve(__dirname, '../../src/proto'),
			'test-utils': path.resolve(__dirname, '../test-utils'),
		},
	},
	server: {
		fs: {
			allow: [path.resolve(__dirname, '..')],
		},
	},
});