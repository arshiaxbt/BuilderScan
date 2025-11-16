import { ExtractArgs, EverythingProviderArgs, ExtractReturn } from '@cursor/types';
import * as vscode from 'vscode';

export type ExtraContext = {
	context: vscode.ExtensionContext;
};

type ActionMap = {
	[K in EverythingProviderArgs['name']]?: (
		args: ExtractArgs<K>,
		extraContext: ExtraContext
	) => ExtractReturn<K>
};

export const ACTION_REGISTRY: ActionMap = {};

export function registerAction<K extends EverythingProviderArgs['name']>(
	name: K,
	action: (args: ExtractArgs<K>, extraContext: ExtraContext) => ExtractReturn<K>
) {
	if (name in ACTION_REGISTRY) {
		throw new Error(`Action ${name} already registered`);
	}
	// I tried finicking with this to get the TS to work, but to no avail
	// @ts-ignore
	ACTION_REGISTRY[name] = action;
}
