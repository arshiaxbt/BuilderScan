import { describe, it, expect } from 'vitest';
import { AsyncIterPushable } from '../../src/utils/asyncIterPushable';

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const v of iter) out.push(v);
	return out;
}

describe('AsyncIterPushable', () => {
	it('yields pushed values and ends on end()', async () => {
		const p = new AsyncIterPushable<number>(50);
		p.push(1);
		p.push(2);
		p.end();
		const values = await collect(p);
		expect(values).toEqual([1, 2]);
	});

	it('ends on timeout when no values are pushed', async () => {
		const p = new AsyncIterPushable<number>(30);
		const values = await collect(p);
		expect(values).toEqual([]);
	});

	it('propagates error thrown via throw()', async () => {
		const p = new AsyncIterPushable<number>(100);
		const it = p[Symbol.asyncIterator]();
		const next = it.next();
		await expect(it.throw!(new Error('boom'))).resolves.toEqual({ done: true, value: undefined });
		await expect(next).rejects.toThrow('boom');
	});
});