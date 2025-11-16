import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import { dirname } from 'path';
import { Transform, pipeline } from 'stream';
import { NdjsonIngestLogger } from './logger.js';

let server: http.Server | undefined;
let currentPort: number = 0;
let logPath: string = '';
let externalUrl: string = '';

type ServerConfig = {
	externalUrl: string;
	logPath: string;
};

function ensureTrailingNewline(): Transform {
	let last: number = 0x0a;
	return new Transform({
		transform(chunk: Buffer, _enc: string, cb: (error?: Error | null, data?: Buffer) => void): void {
			last = chunk[chunk.length - 1];
			cb(null, chunk);
		},
		flush(cb: (error?: Error | null) => void): void {
			if (last !== 0x0a) {
				this.push(Buffer.from('\n'));
			}
			cb();
		}
	});
}

let writeQueue: Promise<void> = Promise.resolve();

async function appendExclusive(src: NodeJS.ReadableStream, destPath: string): Promise<void> {
	const run = (): Promise<void> => new Promise<void>((resolve, reject) => {
		const out: fs.WriteStream = fs.createWriteStream(destPath, { flags: 'a' });
		pipeline(src, ensureTrailingNewline(), out, (err: NodeJS.ErrnoException | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});

	const p: Promise<void> = writeQueue.then(run, run);
	writeQueue = p.catch((e) => {
		NdjsonIngestLogger.error('Error appending to log file:', e);
	});
	return p;
}

async function startServer(context: vscode.ExtensionContext): Promise<{ externalUrl: string, logPath: string } | undefined> {
	if (!vscode.workspace.isTrusted) {
		vscode.window.showWarningMessage('debug mode disabled in untrusted workspace.');
		return;
	}

	const ws: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders?.[0];
	if (!ws) {
		vscode.window.showErrorMessage('No workspace storage available (open a folder/workspace).');
		return;
	}

	if (server) {
		return { externalUrl: externalUrl, logPath: logPath };
	}

	const cfg = vscode.workspace.getConfiguration('ndjson');
	const relativeLogFile = cfg.get<string>('relativeLogFile', '.cursor/debug.log');
	const logUri: vscode.Uri = vscode.Uri.joinPath(ws.uri, relativeLogFile);
	fs.mkdirSync(dirname(logUri.fsPath), { recursive: true });
	logPath = logUri.fsPath;
	server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		if (req.method !== 'POST' || req.url !== '/ingest') {
			res.writeHead(404);
			res.end();
			return;
		}

		appendExclusive(req, logPath)
			.then(() => {
				res.writeHead(204);
				res.end();
			})
			.catch((err: Error) => {
				NdjsonIngestLogger.error('NDJSON ingest write error:', err);
				res.writeHead(500);
				res.end('write-failed');
			});
	});

	const port = cfg.get<number>('port', 0);
	const bindAddress = cfg.get<string>('bindAddress', '127.0.0.1');
	let readyCallback: (config?: ServerConfig) => void;
	const readyPromise = new Promise<ServerConfig | undefined>(resolve => readyCallback = resolve);
	// Handle port-in-use or other listen errors gracefully (do not write server info).
	server.once('error', (err: NodeJS.ErrnoException) => {
		NdjsonIngestLogger.error('NDJSON ingest server listen error:', err);
		server = undefined;
		readyCallback();
	});
	server.listen(port, bindAddress, async () => {
		const addr: string | import('net').AddressInfo | null = server!.address();
		currentPort = typeof addr === 'object' && addr ? addr.port : 0;

		const loopback: vscode.Uri = vscode.Uri.parse(`http://${bindAddress}:${currentPort}/ingest`);
		try {
			const external: vscode.Uri = await vscode.env.asExternalUri(loopback);
			externalUrl = external.toString();
		} catch (e) {
			NdjsonIngestLogger.error('asExternalUri failed; using loopback URL', e);
			externalUrl = loopback.toString();
		}

		try {
			if (fs.existsSync(logPath)) {
				fs.unlinkSync(logPath);
			}
		} catch (e) {
			NdjsonIngestLogger.error('Error clearing existing log file:', e);
		}

		NdjsonIngestLogger.info(`NDJSON ingest server started on port ${currentPort}`);
		readyCallback({ externalUrl: externalUrl, logPath: logPath });
	});
	return readyPromise;
}

async function stopServer() {
	NdjsonIngestLogger.info('Stopping NDJSON ingest server');
	if (server) {
		await new Promise<void>((resolve) => server!.close(() => resolve())).catch((err) => {
			NdjsonIngestLogger.error('Error stopping NDJSON ingest server:', err);
		});
		server = undefined;
	}
	// Do not delete the server info file on stop; if another process is running,
	// it remains correct, and if none are running, harmlessly stale.
}

export async function activate(context: vscode.ExtensionContext) {
	NdjsonIngestLogger.init();
	context.subscriptions.push(vscode.commands.registerCommand('cursor.ndjsonIngest.start', () => startServer(context)));
	context.subscriptions.push(vscode.commands.registerCommand('cursor.ndjsonIngest.stop', () => stopServer()));
	context.subscriptions.push(vscode.commands.registerCommand('cursor.ndjsonIngest.copyCurl', async () => {
		if (!externalUrl) { vscode.window.showWarningMessage('Server is not running.'); return; }
		const cmd = `curl -sS -H "Content-Type: application/x-ndjson" --data-binary '{"hello":"world"}' "${externalUrl.toString()}"`;
		await vscode.env.clipboard.writeText(cmd);
		vscode.window.showInformationMessage('NDJSON Ingest: curl command copied to clipboard.');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('cursor.ndjsonIngest.showStatus', () => {
		if (!externalUrl) { vscode.window.showInformationMessage('NDJSON: server not running.'); return; }
		vscode.window.showInformationMessage(`URL: ${externalUrl.toString()}`);
	}));
}

export async function deactivate(): Promise<void> {
	await stopServer();
}
