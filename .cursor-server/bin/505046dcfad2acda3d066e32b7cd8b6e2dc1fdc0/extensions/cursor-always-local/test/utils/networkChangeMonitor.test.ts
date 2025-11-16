import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkChangeMonitor } from '../../src/utils/networkChangeMonitor';

// Minimal stub PromiseClient
class StubClient {
	constructor(private behavior: 'ok' | 'timeout' | 'error') { }
	async isConnected() {
		if (this.behavior === 'ok') return {};
		if (this.behavior === 'timeout') return await new Promise(() => { });
		throw new Error('boom');
	}
}

describe('NetworkChangeMonitor', () => {
	beforeEach(() => {
		// silence logger errors if any
		vi.spyOn(console, 'error').mockImplementation(() => { });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('isConnected returns true when client resolves', async () => {
		const m = new NetworkChangeMonitor(100, () => { });
		const ok = await m.isConnected(new StubClient('ok') as any);
		expect(ok).toBe(true);
	});

	it('isConnected returns false on timeout', async () => {
		vi.useFakeTimers();

		const m = new NetworkChangeMonitor(100, () => { });
		const timeoutPromise = m.isConnected(new StubClient('timeout') as any);

		// Advance timers by 6 seconds to trigger the timeout
		await vi.advanceTimersByTimeAsync(6000);

		const ok = await timeoutPromise;
		expect(ok).toBe(false);

		vi.useRealTimers();
	});

	it('isConnected returns false and logs on error', async () => {
		const m = new NetworkChangeMonitor(100, () => { });
		const ok = await m.isConnected(new StubClient('error') as any);
		expect(ok).toBe(false);
	});
});