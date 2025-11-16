import { z } from 'zod';

type ToolSpecBase = {
	description: string;
	params?: z.ZodTypeAny;
	result?: z.ZodTypeAny;
};

type ToolImplFor<Spec extends ToolSpecBase> = (
	params: Spec['params'] extends z.ZodTypeAny ? z.infer<Spec['params']> : void
) =>
	| (Spec['result'] extends z.ZodTypeAny ? z.infer<Spec['result']> : unknown)
	| Promise<Spec['result'] extends z.ZodTypeAny ? z.infer<Spec['result']> : unknown>;

export type ToolDefsWithImpl<T extends Record<string, ToolSpecBase>> = {
	[K in keyof T]: T[K] & { impl: ToolImplFor<T[K]> };
};

export function createMcpTools<T extends Record<string, ToolSpecBase>>(defs: ToolDefsWithImpl<T>) {
	const handlers = new Map<string, (params: unknown) => Promise<unknown>>();

	for (const [name, spec] of Object.entries(defs)) {
		handlers.set(name, async (params: unknown) => {
			let parsedParams = params;
			if (spec.params) {
				const res = spec.params.safeParse(params);
				if (!res.success) {
					throw new Error(`Invalid params: ${res.error.message}`);
				}
				parsedParams = res.data;
			}

			const result = await (spec.impl as (p: unknown) => Promise<unknown> | unknown)(parsedParams);
			if (spec.result) {
				const rr = spec.result.safeParse(result);
				if (!rr.success) {
					throw new Error(`Invalid result: ${rr.error.message}`);
				}
				return rr.data as unknown;
			}
			return result as unknown;
		});
	}

	function offerings(): { name: string; description: string; parameters: string }[] {
		return Object.entries(defs).map(([name, spec]) => ({
			name,
			description: spec.description,
			parameters: JSON.stringify({ type: 'object', properties: {}, required: [] }),
		}));
	}

	async function call(name: string, args: unknown): Promise<unknown> {
		const handler = handlers.get(name);
		if (!handler) {
			throw new Error(`Unknown tool: ${name}`);
		}
		return handler(args);
	}

	return { offerings, call };
}


