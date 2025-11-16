import { WebSocket } from 'ws';
import { z } from 'zod';

// Base RPC message schemas
const RPCRequestSchema = z.object({
	id: z.string(),
	method: z.string(),
	params: z.unknown().optional(),
});

const RPCResponseSchema = z.object({
	id: z.string(),
	result: z.unknown().optional(),
	error: z.object({
		code: z.number(),
		message: z.string(),
	}).optional(),
}).refine(
	(data) => data.result !== undefined || data.error !== undefined,
	{ message: "Response must have either 'result' or 'error'" }
);

const RPCNotificationSchema = z.object({
	method: z.string(),
	params: z.unknown().optional(),
});

// Type guards using Zod
function isRPCRequest(message: unknown): message is z.infer<typeof RPCRequestSchema> {
	const result = RPCRequestSchema.safeParse(message);
	return result.success;
}

function isRPCResponse(message: unknown): message is z.infer<typeof RPCResponseSchema> {
	const result = RPCResponseSchema.safeParse(message);
	return result.success;
}

function isRPCNotification(message: unknown): message is z.infer<typeof RPCNotificationSchema> {
	// A notification has method but no id
	if (typeof message !== 'object' || message === null) return false;
	const obj = message as Record<string, unknown>;
	return 'method' in obj && !('id' in obj);
}

// Method registry types
type MethodHandler<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult> | TResult;
type NotificationHandler<TParams = unknown> = (params: TParams) => void | Promise<void>;

// Generic method definitions
export interface MethodDefinitions {
	[method: string]: {
		params?: z.ZodType<any>;
		result?: z.ZodType<any>;
	};
}

// Type-safe method caller
type MethodCaller<TMethods extends MethodDefinitions> = {
	[K in keyof TMethods]: TMethods[K]['params'] extends z.ZodType<infer P>
	? TMethods[K]['result'] extends z.ZodType<infer R>
	? (params: P) => Promise<R>
	: (params: P) => Promise<unknown>
	: TMethods[K]['result'] extends z.ZodType<infer R>
	? () => Promise<R>
	: () => Promise<unknown>;
};

// Type-safe notification sender
type NotificationSender<TMethods extends MethodDefinitions> = {
	[K in keyof TMethods]: TMethods[K]['params'] extends z.ZodType<infer P>
	? (params: P) => void
	: () => void;
};

// Type-safe method handlers
export type MethodHandlers<TMethods extends MethodDefinitions> = {
	[K in keyof TMethods]?: TMethods[K]['params'] extends z.ZodType<infer P>
	? TMethods[K]['result'] extends z.ZodType<infer R>
	? MethodHandler<P, R>
	: MethodHandler<P, unknown>
	: TMethods[K]['result'] extends z.ZodType<infer R>
	? MethodHandler<void, R>
	: MethodHandler<void, unknown>;
};

// Type-safe notification handlers
export type NotificationHandlers<TMethods extends MethodDefinitions> = {
	[K in keyof TMethods]?: TMethods[K]['params'] extends z.ZodType<infer P>
	? NotificationHandler<P>
	: NotificationHandler<void>;
};

export class RPCClient<
	TClientMethods extends MethodDefinitions = MethodDefinitions,
	TServerMethods extends MethodDefinitions = MethodDefinitions
> {
	private ws: WebSocket;
	private pendingRequests = new Map<string, {
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		resultSchema?: z.ZodType<any>;
	}>();
	private requestCounter = 0;
	private methodHandlers = new Map<string, MethodHandler>();
	private notificationHandlers = new Map<string, NotificationHandler>();
	private clientMethodSchemas: TClientMethods;
	private serverMethodSchemas: TServerMethods;
	public readonly id: string;

	// Type-safe method callers
	public readonly call: MethodCaller<TServerMethods>;
	public readonly notify: NotificationSender<TServerMethods>;

	constructor(
		ws: WebSocket,
		clientId: string,
		clientMethods: TClientMethods,
		serverMethods: TServerMethods
	) {
		this.ws = ws;
		this.id = clientId;
		this.clientMethodSchemas = clientMethods;
		this.serverMethodSchemas = serverMethods;

		// Create type-safe call proxy
		this.call = new Proxy({} as MethodCaller<TServerMethods>, {
			get: (_, method: string) => {
				return async (params?: unknown) => {
					const methodDef = this.serverMethodSchemas[method];
					if (!methodDef) {
						throw new Error(`Unknown server method: ${method}`);
					}

					// Validate params if schema exists
					if (methodDef.params && params !== undefined) {
						const parseResult = methodDef.params.safeParse(params);
						if (!parseResult.success) {
							throw new Error(`Invalid params for ${method}: ${parseResult.error.message}`);
						}
					}

					return this.callMethod(method, params, methodDef.result);
				};
			}
		});

		// Create type-safe notify proxy
		this.notify = new Proxy({} as NotificationSender<TServerMethods>, {
			get: (_, method: string) => {
				return (params?: unknown) => {
					const methodDef = this.serverMethodSchemas[method];
					if (!methodDef) {
						throw new Error(`Unknown server method: ${method}`);
					}

					// Validate params if schema exists
					if (methodDef.params && params !== undefined) {
						const parseResult = methodDef.params.safeParse(params);
						if (!parseResult.success) {
							throw new Error(`Invalid params for ${method}: ${parseResult.error.message}`);
						}
					}

					this.sendNotification(method, params);
				};
			}
		});

		this.setupHandlers();
	}

	/**
	 * Register method handlers for incoming requests
	 */
	public registerHandlers(handlers: MethodHandlers<TClientMethods>): void {
		for (const [method, handler] of Object.entries(handlers)) {
			if (handler) {
				this.methodHandlers.set(method, handler as MethodHandler);
			}
		}
	}

	/**
	 * Register notification handlers for incoming notifications
	 */
	public registerNotificationHandlers(handlers: NotificationHandlers<TClientMethods>): void {
		for (const [method, handler] of Object.entries(handlers)) {
			if (handler) {
				this.notificationHandlers.set(method, handler as NotificationHandler);
			}
		}
	}

	private setupHandlers(): void {
		this.ws.on('message', (data) => {
			try {
				const rawData = data.toString();
				console.log(`[RPCClient ${this.id}] Received raw message:`, rawData.substring(0, 200));
				const message = JSON.parse(rawData);
				this.handleMessage(message);
			} catch (error) {
				console.error(`[RPCClient ${this.id}] Failed to parse message:`, error);
			}
		});

		this.ws.on('close', () => {
			// Reject all pending requests
			this.pendingRequests.forEach(({ reject }) => {
				reject(new Error('Connection closed'));
			});
			this.pendingRequests.clear();
		});

		this.ws.on('error', (error) => {
			console.error(`[RPCClient ${this.id}] WebSocket error:`, error);
		});
	}

	private handleMessage(message: unknown): void {
		console.log(`[RPCClient ${this.id}] Processing message:`, JSON.stringify(message).substring(0, 200));

		// Handle response
		if (isRPCResponse(message)) {
			console.log(`[RPCClient ${this.id}] Message identified as RESPONSE`);
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				if (message.error) {
					pending.reject(new Error(message.error.message));
				} else {
					// Validate result if schema exists
					if (pending.resultSchema) {
						const parseResult = pending.resultSchema.safeParse(message.result);
						if (parseResult.success) {
							pending.resolve(parseResult.data);
						} else {
							pending.reject(new Error(`Invalid result: ${parseResult.error.message}`));
						}
					} else {
						pending.resolve(message.result);
					}
				}
			} else {
				console.log(`[RPCClient ${this.id}] No pending request found for response ID: ${message.id}`);
			}
			return;
		}

		// Handle notification
		if (isRPCNotification(message)) {
			console.log(`[RPCClient ${this.id}] Message identified as NOTIFICATION`);
			this.handleNotification(message);
			return;
		}

		// Handle request
		if (isRPCRequest(message)) {
			console.log(`[RPCClient ${this.id}] Message identified as REQUEST`);
			this.handleRequest(message);
			return;
		}

		console.error(`[RPCClient ${this.id}] Unknown message type:`, message);
	}

	private async handleRequest(request: z.infer<typeof RPCRequestSchema>): Promise<void> {
		console.log(`[RPCClient ${this.id}] Handling request: ${request.method} (id: ${request.id})`);

		const handler = this.methodHandlers.get(request.method);
		if (!handler) {
			console.error(`[RPCClient ${this.id}] No handler for method: ${request.method}`);
			this.sendError(request.id, `Unknown method: ${request.method}`);
			return;
		}

		try {
			// Validate params if schema exists
			// For incoming requests, we validate against clientMethodSchemas
			// because these are the methods that THIS side implements
			const methodDef = this.clientMethodSchemas[request.method];
			let validatedParams = request.params;

			if (methodDef?.params) {
				const parseResult = methodDef.params.safeParse(request.params);
				if (!parseResult.success) {
					console.error(`[RPCClient ${this.id}] Invalid params for ${request.method}:`, parseResult.error.message);
					this.sendError(request.id, `Invalid params: ${parseResult.error.message}`);
					return;
				}
				validatedParams = parseResult.data;
			}

			console.log(`[RPCClient ${this.id}] Calling handler for ${request.method}`);
			const result = await handler(validatedParams);

			// Validate result if schema exists
			if (methodDef?.result) {
				const parseResult = methodDef.result.safeParse(result);
				if (!parseResult.success) {
					console.error(`[RPCClient ${this.id}] Invalid result for ${request.method}:`, parseResult.error.message);
					this.sendError(request.id, `Invalid result: ${parseResult.error.message}`);
					return;
				}
			}

			console.log(`[RPCClient ${this.id}] Sending response for ${request.method} (id: ${request.id})`);
			this.sendResponse(request.id, result);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Internal error';
			console.error(`[RPCClient ${this.id}] Error handling ${request.method}:`, error);
			this.sendError(request.id, errorMessage);
		}
	}

	private handleNotification(notification: z.infer<typeof RPCNotificationSchema>): void {
		const handler = this.notificationHandlers.get(notification.method);
		if (!handler) {
			console.warn(`[RPCClient ${this.id}] No handler for notification:`, notification.method);
			return;
		}

		// Validate params if schema exists
		const methodDef = this.clientMethodSchemas[notification.method];
		let validatedParams = notification.params;

		if (methodDef?.params) {
			const parseResult = methodDef.params.safeParse(notification.params);
			if (!parseResult.success) {
				console.error(`[RPCClient ${this.id}] Invalid notification params:`, parseResult.error.message);
				return;
			}
			validatedParams = parseResult.data;
		}

		Promise.resolve(handler(validatedParams)).catch((error) => {
			console.error(`[RPCClient ${this.id}] Notification handler error:`, error);
		});
	}

	private async callMethod(method: string, params: unknown, resultSchema?: z.ZodType<any>): Promise<unknown> {
		const id = `${this.id}-${this.requestCounter++}`;
		const request = { id, method, params };

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error('Request timeout'));
			}, 30000); // 30 second timeout

			this.pendingRequests.set(id, {
				resolve: (value) => {
					clearTimeout(timeout);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
				resultSchema
			});

			this.send(request);
		});
	}

	private sendNotification(method: string, params?: unknown): void {
		const notification = { method, params };
		this.send(notification);
	}

	private sendResponse(id: string, result: unknown): void {
		const response = { id, result };
		this.send(response);
	}

	private sendError(id: string, message: string, code: number = -32603): void {
		const response = { id, error: { code, message } };
		this.send(response);
	}

	private send(message: unknown): void {
		if (this.ws.readyState === WebSocket.OPEN) {
			const serialized = JSON.stringify(message);
			console.log(`[RPCClient ${this.id}] Sending message:`, serialized.substring(0, 200));
			this.ws.send(serialized);
		} else {
			console.warn(`[RPCClient ${this.id}] Cannot send message, WebSocket not open (state: ${this.ws.readyState})`);
		}
	}

	public close(): void {
		this.ws.close();
	}

	public get isConnected(): boolean {
		return this.ws.readyState === WebSocket.OPEN;
	}
}
