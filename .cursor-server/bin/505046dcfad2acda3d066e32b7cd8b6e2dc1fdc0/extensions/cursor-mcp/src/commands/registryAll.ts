import { ACTION_REGISTRY, ExtraContext } from './registry';
import './mcpCommands'
import { EverythingProviderArgs, ExtractArgs, ExtractReturn } from '@cursor/types';


export function getCommandFromRegistry<K extends EverythingProviderArgs['name']>(commandName: K): ((args: ExtractArgs<K>, extraContext: ExtraContext) => ExtractReturn<K>) | undefined {
	// @ts-ignore (Needed for gulpfile building only)
	return ACTION_REGISTRY[commandName];
}
