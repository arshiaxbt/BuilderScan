import { z } from 'zod';
import type { MethodDefinitions } from './rpc-client';

// Server notifications (fire-and-forget methods that the VS Code extension handles)
export const serverNotifications = {
	updateActiveData: {
		params: z.object({
			title: z.string(),
			url: z.string(),
		}),
	},
} satisfies MethodDefinitions;

// Client methods (methods that the browser/client exposes)
export const clientMethods = {
	captureSnapshot: {
		result: z.object({
			snapshot: z.string(),
			timestamp: z.string(),
			url: z.string(),
		}),
	},
} satisfies MethodDefinitions;

// Export types for use in other files
export type ServerNotifications = typeof serverNotifications;
export type ClientMethods = typeof clientMethods;