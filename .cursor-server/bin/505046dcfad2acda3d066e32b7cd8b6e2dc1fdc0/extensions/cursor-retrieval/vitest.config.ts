import { defineConfig } from 'vitest/config';
import path from 'path';

const isInjected: boolean = process.env.INJECT_FILE_SERVICE === '1' || process.env.INJECT_FILE_SERVICE === 'true';

// Build the module alias map. Only in the injected mode do we replace
// @anysphere/file-service with the test mock. All other aliases are shared.
function createAliases(injectFileService: boolean): Record<string, string> {
	const aliases: Record<string, string> = {
		'vscode': path.resolve(__dirname, '../test-utils/vscodeMock.ts'),
		'@cursor/types': path.resolve(__dirname, '../../src/vs/platform/reactivestorage/common/reactiveStorageTypes'),
		'@cursor/experiment-config': path.resolve(__dirname, '../../src/vs/platform/experiments/common/experimentConfig.gen'),
		'proto': path.resolve(__dirname, '../../src/proto'),
		'test-utils': path.resolve(__dirname, '../test-utils'),
	};
	if (injectFileService) {
		aliases['@anysphere/file-service'] = path.resolve(__dirname, '../test-utils/fileServiceMock.ts');
	}
	return aliases;
}

export default defineConfig({
	test: {
		environment: 'node',
		// Keep these suites mutually exclusive so we can run them with different dependency wiring.
		// Default: unit tests under src/**. Injected: the repoIndexWatcher integration-style test.
		include: isInjected ? ['test/indexing/repoIndexWatcher.test.ts'] : ['src/**/*.test.ts'],
		testTimeout: 30000,
		globals: true,
		setupFiles: ['./test/vitest.setup.ts'],
	},
	resolve: {
		alias: createAliases(isInjected),
	},
	server: {
		fs: {
			allow: [path.resolve(__dirname, '..')],
		},
	},
});