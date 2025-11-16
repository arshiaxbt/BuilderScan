import { LogOutputChannel } from 'vscode';
import * as vscode from 'vscode';

const sendMCPLogsToRenderer = false

export class McpLogger {
	private static output: LogOutputChannel;
	private static instances: Map<string, McpLogger> = new Map();
	private output: LogOutputChannel;

	// Static initialization method
	public static init(): void {
		McpLogger.output = vscode.window.createOutputChannel('MCP Logs', { log: true });
	}

	// Factory method to get or create a logger for a specific server
	public static getLogger(identifier: string): McpLogger {
		// Initialize static output if not already done
		if (!McpLogger.output) {
			McpLogger.init();
		}

		if (!McpLogger.instances.has(identifier)) {
			McpLogger.instances.set(identifier, new McpLogger(identifier));
		}
		return McpLogger.instances.get(identifier)!;
	}

	// Constructor for server-specific logger instances
	private constructor(identifier: string) {
		try {
			this.output = vscode.window.createOutputChannel(`MCP: ${identifier}`, { log: true });
		} catch (error) {
			console.error(`Failed to create output channel for MCP: ${identifier}`, error);
			// Fallback to static output if instance creation fails
			this.output = McpLogger.output;
		}
	}

	// Instance methods for server-specific logging
	public error(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.error("MCP: " + msg, ...args);
		}
		this.output.error(msg, ...args);
	}
	public warn(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.warn("MCP: " + msg, ...args);
		}
		this.output.warn(msg, ...args);
	}
	public info(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.info("MCP: " + msg, ...args);
		}
		this.output.info(msg, ...args);
	}
	public debug(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.debug("MCP: " + msg, ...args);
		}
		this.output.debug(msg, ...args);
	}
	public trace(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.trace("MCP: " + msg, ...args);
		}
		this.output.trace(msg, ...args);
	}

	// Static methods for backward compatibility (using the general MCP Logs channel)
	public static error(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.error("MCP: " + msg, ...args);
		}
		McpLogger.output.error(msg, ...args);
	}
	public static warn(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.warn("MCP: " + msg, ...args);
		}
		McpLogger.output.warn(msg, ...args);
	}
	public static info(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.info("MCP: " + msg, ...args);
		}
		McpLogger.output.info(msg, ...args);
	}
	public static debug(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.debug("MCP: " + msg, ...args);
		}
		McpLogger.output.debug(msg, ...args);
	}
	public static trace(msg: string, ...args: any[]): void {
		if (sendMCPLogsToRenderer) {
			console.trace("MCP: " + msg, ...args);
		}
		McpLogger.output.trace(msg, ...args);
	}
}



