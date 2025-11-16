import * as vscode from 'vscode';

export class PlaywrightLogger {
	private static outputChannel: vscode.OutputChannel;
	private static loggers: Map<string, PlaywrightLogger> = new Map();

	private constructor(private identifier: string) { }

	static init(): void {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel('Cursor Browser Extension');
		}
	}

	static getLogger(identifier: string): PlaywrightLogger {
		if (!this.loggers.has(identifier)) {
			this.loggers.set(identifier, new PlaywrightLogger(identifier));
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
		PlaywrightLogger.log('INFO', this.identifier, message);
	}

	warn(message: string): void {
		PlaywrightLogger.log('WARN', this.identifier, message);
	}

	error(message: string, error?: Error): void {
		const errorMessage = error ? `${message}: ${error.message}` : message;
		PlaywrightLogger.log('ERROR', this.identifier, errorMessage);
		if (error?.stack) {
			PlaywrightLogger.log('ERROR', this.identifier, error.stack);
		}
	}

	private static log(level: string, identifier: string, message: string): void {
		if (this.outputChannel) {
			const timestamp = new Date().toISOString();
			this.outputChannel.appendLine(`[${timestamp}] [${level}] [${identifier}] ${message}`);
		}
	}
}
