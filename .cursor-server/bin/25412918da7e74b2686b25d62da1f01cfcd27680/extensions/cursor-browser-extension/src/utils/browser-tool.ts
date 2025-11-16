import z from 'zod';
import type { Tab } from './context.js';

export interface BrowserToolContext {
	ensureTab: () => Promise<void>;
	newTab: () => Promise<void>;
	closeTab: (index?: number) => Promise<void>;
	selectTab: (index: number) => Promise<void>;
	navigate: (url: string) => Promise<void>;
	goBack: () => Promise<void>;
	outputFile: (filename: string) => Promise<string>;
	currentTab: () => Tab | undefined;
	tabs: () => Tab[];
}

export interface BrowserToolResponse {
	setIncludeTabs: () => void;
	setIncludeSnapshot: () => void;
	addCode: (code: string) => void;
	addResult: (result: string) => void;
	addImage: (image: { contentType: string; data: Buffer }) => void;
	getData: () => {
		includeTabs?: boolean;
		includeSnapshot?: boolean;
		code?: string[];
		result?: string[];
		images?: Array<{ contentType: string; data: Buffer }>;
	};
}

export interface BrowserTool<InputT> {
	name: string;
	description: string;
	params: z.ZodType<InputT>;
	handle: (
		context: BrowserToolContext,
		params: InputT,
		response: BrowserToolResponse
	) => unknown | Promise<unknown>;
}

export function defineBrowserTool<InputT>(
	tool: BrowserTool<InputT>
): BrowserTool<InputT> {
	return tool;
}
