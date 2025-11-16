import * as vscode from 'vscode';

export class CursorIDEBrowserLogger {
	private static outputChannel: vscode.OutputChannel;
	private static loggers: Map<string, CursorIDEBrowserLogger> = new Map();

	private constructor(private identifier: string) { }

	static init(): void {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel('Cursor IDE Browser Automation');
		}
	}

	static getLogger(identifier: string): CursorIDEBrowserLogger {
		if (!this.loggers.has(identifier)) {
			this.loggers.set(identifier, new CursorIDEBrowserLogger(identifier));
		}
		return this.loggers.get(identifier)!;
	}

	static info(message: string): void {
		this.log('INFO', 'general', message);
	}

	static warn(message: string): void {
		this.log('WARN', 'general', message);
	}

	static error(message: string, error?: Error): void {
		const errorMessage = error ? `${message}: ${error.message}` : message;
		this.log('ERROR', 'general', errorMessage);
		if (error?.stack) {
			this.log('ERROR', 'general', error.stack);
		}
	}

	info(message: string): void {
		CursorIDEBrowserLogger.log('INFO', this.identifier, message);
	}

	warn(message: string): void {
		CursorIDEBrowserLogger.log('WARN', this.identifier, message);
	}

	error(message: string, error?: Error): void {
		const errorMessage = error ? `${message}: ${error.message}` : message;
		CursorIDEBrowserLogger.log('ERROR', this.identifier, errorMessage);
		if (error?.stack) {
			CursorIDEBrowserLogger.log('ERROR', this.identifier, error.stack);
		}
	}

	private static log(level: string, identifier: string, message: string): void {
		if (this.outputChannel) {
			const timestamp = new Date().toISOString();
			this.outputChannel.appendLine(`[${timestamp}] [${level}] [${identifier}] ${message}`);
		}
	}
}
