import * as vscode from 'vscode';

export class NdjsonIngestLogger {
	private static output: vscode.LogOutputChannel | undefined;

	public static init(): void {
		NdjsonIngestLogger.output = vscode.window.createOutputChannel(
			'NDJSON Ingest',
			{ log: true }
		);
	}

	public static error(msg: string, ...args: any[]): void {
		if (!NdjsonIngestLogger.output) {
			NdjsonIngestLogger.init();
		}
		NdjsonIngestLogger.output?.error(msg, ...args);
	}

	public static warn(msg: string, ...args: any[]): void {
		if (!NdjsonIngestLogger.output) {
			NdjsonIngestLogger.init();
		}
		NdjsonIngestLogger.output?.warn(msg, ...args);
	}

	public static info(msg: string, ...args: any[]): void {
		if (!NdjsonIngestLogger.output) {
			NdjsonIngestLogger.init();
		}
		NdjsonIngestLogger.output?.info(msg, ...args);
	}

	public static debug(msg: string, ...args: any[]): void {
		if (!NdjsonIngestLogger.output) {
			NdjsonIngestLogger.init();
		}
		NdjsonIngestLogger.output?.debug(msg, ...args);
	}

	public static trace(msg: string, ...args: any[]): void {
		if (!NdjsonIngestLogger.output) {
			NdjsonIngestLogger.init();
		}
		NdjsonIngestLogger.output?.trace(msg, ...args);
	}
}
