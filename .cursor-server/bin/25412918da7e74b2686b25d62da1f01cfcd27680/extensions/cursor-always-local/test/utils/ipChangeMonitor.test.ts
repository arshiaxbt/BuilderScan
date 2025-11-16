import { describe, it, expect, vi } from 'vitest';
import { createAbortErrorAndTimeoutInterceptor, wrapCallbackInTryCatch } from '../../src/utils/ipChangeMonitor';
import type { Interceptor, UnaryRequest } from '@connectrpc/connect';

function makeReq(): UnaryRequest {
	return {
		stream: false,
		service: { typeName: 'X' } as any,
		method: { name: 'm' } as any,
		header: new Headers(),
		signal: new AbortController().signal,
		url: 'http://example.com',
		message: {},
	};
}

describe('ipChangeMonitor', () => {
	it('wrapCallbackInTryCatch returns false on throw and returns value otherwise', () => {
		expect(wrapCallbackInTryCatch(() => 42)).toBe(42);
		expect(wrapCallbackInTryCatch(() => { throw new Error('x'); })).toBe(false);
	});

	it('interceptor resolves with next result before timeout', async () => {
		const getId = () => 1;
		const cb = vi.fn().mockResolvedValue(false);
		const interceptor: Interceptor = createAbortErrorAndTimeoutInterceptor(getId, cb, 50);
		const next = vi.fn(async () => 'ok');
		const req = makeReq();
		const res = await interceptor(next as any)(req as any);
		expect(res).toBe('ok');
		expect(cb).not.toHaveBeenCalled();
	});

	it('interceptor triggers callback on timeout and rejects when network changed', async () => {
		let networkId = 1;
		const getId = () => networkId;
		const cb = vi.fn(async (starting?: number) => starting === 1);
		const interceptor: Interceptor = createAbortErrorAndTimeoutInterceptor(getId, cb, 10);
		const never = vi.fn(async () => await new Promise(() => {}));
		await expect(interceptor(never as any)(makeReq() as any)).rejects.toThrow();
		expect(cb).toHaveBeenCalled();
	});

	it('interceptor triggers callback on abort', async () => {
		const getId = () => 1;
		const cb = vi.fn().mockResolvedValue(false);
		const interceptor: Interceptor = createAbortErrorAndTimeoutInterceptor(getId, cb, 1000);
		const ac = new AbortController();
		const req = makeReq();
		Object.defineProperty(req, 'signal', { value: ac.signal });
		const next = vi.fn(async () => {
			ac.abort();
			return 'ok';
		});
		await expect(interceptor(next as any)(req as any)).resolves.toBe('ok');
		expect(cb).toHaveBeenCalled();
	});
});