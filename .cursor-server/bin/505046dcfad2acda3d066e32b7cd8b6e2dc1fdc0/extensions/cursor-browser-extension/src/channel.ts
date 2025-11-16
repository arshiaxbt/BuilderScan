import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { PlaywrightLogger } from './utils/logger.js';
import { randomUUID } from 'node:crypto';

/**
 * A bidirectional channel that provides separate transports for client and server
 * enabling communication between MCP client and server instances
 */
export class McpChannel {
	private _clientTransport: ClientTransport;
	private _serverTransport: ServerTransport;

	constructor() {
		this._clientTransport = new ClientTransport(this);
		this._serverTransport = new ServerTransport(this);
	}

	get clientTransport(): Transport {
		return this._clientTransport;
	}

	get serverTransport(): Transport {
		return this._serverTransport;
	}

	async close(): Promise<void> {
		await Promise.all([
			this._clientTransport.close(),
			this._serverTransport.close()
		]);

		PlaywrightLogger.info('MCP Channel closed');
	}

	/**
	 * Send message from client to server
	 */
	async sendToServer(message: JSONRPCMessage, extra?: MessageExtraInfo): Promise<void> {
		setTimeout(() => {
			this._serverTransport.onmessage(message, extra);
		}, 0);
	}

	/**
	 * Send message from server to client
	 */
	async sendToClient(message: JSONRPCMessage, extra?: MessageExtraInfo): Promise<void> {
		setTimeout(() => {
			this._clientTransport.onmessage(message, extra);
		}, 0);
	}
}

/**
 * Transport implementation for the client side
 */
class ClientTransport implements Transport {
	public sessionId: string = randomUUID();
	public onmessage: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void = () => { };
	public onclose?: () => void;
	public onerror?: (error: Error) => void;
	public setProtocolVersion?: (version: string) => void;

	constructor(private channel: McpChannel) { }

	async start(): Promise<void> {
		// No-op - transport is ready immediately
	}

	async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
		// Send message to server through the channel
		// Note: TransportSendOptions doesn't match MessageExtraInfo structure, so we pass undefined
		await this.channel.sendToServer(message, undefined);
	}

	async close(): Promise<void> {
		if (this.onclose) {
			this.onclose();
		}
		PlaywrightLogger.info('Client Transport closed');
	}
}

/**
 * Transport implementation for the server side
 */
class ServerTransport implements Transport {
	public sessionId: string = randomUUID();
	public onmessage: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void = () => { };
	public onclose?: () => void;
	public onerror?: (error: Error) => void;
	public setProtocolVersion?: (version: string) => void;

	constructor(private channel: McpChannel) { }

	async start(): Promise<void> {
		// No-op - transport is ready immediately
	}

	async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
		// Send message to client through the channel
		// Note: TransportSendOptions doesn't match MessageExtraInfo structure, so we pass undefined
		await this.channel.sendToClient(message, undefined);
	}

	async close(): Promise<void> {
		if (this.onclose) {
			this.onclose();
		}
		PlaywrightLogger.info('Server Transport closed');
	}
}
