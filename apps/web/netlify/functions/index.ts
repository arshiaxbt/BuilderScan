import type { Handler } from '@netlify/functions';
import DatabaseDriver from 'better-sqlite3';
import { ethers } from 'ethers';

/**
 * ERC-8021 Attribution Parser
 */
const ERC_SUFFIX = '0x80218021802180218021802180218021';
const ERC_SUFFIX_BYTES = ethers.getBytes(ERC_SUFFIX);

function extractBuilderCodesFromCalldata(data: string): string[] {
	try {
		if (!data || data === '0x' || data.length < 66) return [];
		const bytes = ethers.getBytes(data);
		if (bytes.length < 17) return [];
		
		const suffixStart = bytes.length - 16;
		const suffix = bytes.slice(suffixStart);
		if (!suffix.every((b, i) => b === ERC_SUFFIX_BYTES[i])) {
			return [];
		}
		
		const schemaId = bytes[suffixStart - 1];
		
		if (schemaId === 0) {
			return parseSchema0(bytes, suffixStart - 2);
		} else if (schemaId === 1) {
			return parseSchema1(bytes, suffixStart - 2);
		}
		
		return [];
	} catch {
		return [];
	}
}

function parseSchema0(bytes: Uint8Array, pos: number): string[] {
	if (pos < 0) return [];
	const codesLength = bytes[pos];
	if (codesLength === 0 || pos < codesLength) return [];
	const codesStart = pos - codesLength;
	const codesBytes = bytes.slice(codesStart, pos);
	const codesStr = new TextDecoder('ascii').decode(codesBytes);
	return codesStr.split(',').filter(code => code.length > 0);
}

function parseSchema1(bytes: Uint8Array, pos: number): string[] {
	if (pos < 0) return [];
	if (pos < 20) return [];
	const registryAddressPos = pos - 20;
	if (registryAddressPos < 1) return [];
	const chainIdLength = bytes[registryAddressPos - 1];
	if (registryAddressPos - 1 < chainIdLength) return [];
	const chainIdStart = registryAddressPos - 1 - chainIdLength;
	if (chainIdStart < 1) return [];
	const codesLength = bytes[chainIdStart - 1];
	if (chainIdStart - 1 < codesLength) return [];
	const codesStart = chainIdStart - 1 - codesLength;
	const codesBytes = bytes.slice(codesStart, chainIdStart - 1);
	const codesStr = new TextDecoder('ascii').decode(codesBytes);
	return codesStr.split(',').filter(code => code.length > 0);
}

function getDatabase() {
	const dbPath = '/tmp/builderscan.db';
	const db = new DatabaseDriver(dbPath);
	db.pragma('journal_mode = WAL');
	
	// Initialize schema
	db.prepare(`
		CREATE TABLE IF NOT EXISTS builder_codes (
			code TEXT PRIMARY KEY,
			owner_address TEXT NOT NULL,
			app_url TEXT,
			metadata_json TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`).run();
	
	db.prepare(`
		CREATE TABLE IF NOT EXISTS code_stats (
			code TEXT PRIMARY KEY,
			tx_count INTEGER NOT NULL,
			volume_eth TEXT NOT NULL,
			fee_estimate_eth TEXT NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
		)
	`).run();
	
	db.prepare(`
		CREATE TABLE IF NOT EXISTS tx_attributions (
			tx_hash TEXT PRIMARY KEY,
			code TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			value_eth TEXT NOT NULL,
			fee_estimate_eth TEXT NOT NULL,
			FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
		)
	`).run();
	
	db.prepare(`
		CREATE TABLE IF NOT EXISTS code_likes (
			code TEXT PRIMARY KEY,
			likes INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
		)
	`).run();
	
	// Track last scanned block
	db.prepare(`
		CREATE TABLE IF NOT EXISTS indexer_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)
	`).run();
	
	return db;
}

/**
 * Attribution Indexer Serverless Function
 * Scans Base blockchain for ERC-8021 transactions
 * 
 * Can be triggered by:
 * - Netlify Scheduled Function (recommended: every 5 minutes)
 * - Manual API call: GET /api/index
 */
export const handler: Handler = async (event, context) => {
	if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
		return {
			statusCode: 405,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({ error: 'Method not allowed' })
		};
	}

	try {
		const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
		const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
		const db = getDatabase();
		
		// Get last scanned block
		const stateRow = db.prepare('SELECT value FROM indexer_state WHERE key = ?').get('last_block') as { value: string } | undefined;
		const fromBlock = stateRow ? Number(stateRow.value) : 0;
		
		const currentBlock = await provider.getBlockNumber();
		
		// If starting fresh, start from recent blocks (configurable via env)
		// Default: 1 day ago (~43,200 blocks at 2s block time)
		const START_BLOCK_ENV = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;
		const blocksPerDay = 43200; // Base has ~2s block time = 43,200 blocks/day
		const daysBack = process.env.SCAN_DAYS_BACK ? Number(process.env.SCAN_DAYS_BACK) : 1; // Default: 1 day
		
		const startBlock = fromBlock === 0 
			? (START_BLOCK_ENV ?? Math.max(0, currentBlock - (blocksPerDay * daysBack)))
			: fromBlock + 1;
		
		if (startBlock > currentBlock) {
			return {
				statusCode: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				},
				body: JSON.stringify({ 
					success: true, 
					message: 'Already up to date',
					lastBlock: fromBlock,
					currentBlock 
				})
			};
		}
		
		// Scan blocks in larger batches for faster indexing (2000 blocks per run)
		// Netlify functions have 10s timeout on free tier, 26s on pro
		// 2000 blocks should complete in ~30-40s with efficient RPC
		const maxBlocks = 2000;
		const endBlock = Math.min(currentBlock, startBlock + maxBlocks - 1);
		
		let scannedCount = 0;
		let attributionCount = 0;
		
		// Scan blocks sequentially
		for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
			try {
				const block = await provider.getBlock(blockNum, true);
				if (!block?.transactions) continue;
				
				for (const tx of block.transactions as any[]) {
					const codes = extractBuilderCodesFromCalldata(tx.input as string);
					if (codes.length === 0) continue;
					
					const valueEth = ethers.formatEther(tx.value ?? 0n);
					const feeEstimateEth = tx.value && tx.value > 0n
						? (Number(valueEth) * 0.0005).toString()
						: '0';
					
					// Insert attributions
					for (const code of codes) {
						try {
							// Auto-register code if not exists (with placeholder address)
							db.prepare(`
								INSERT OR IGNORE INTO builder_codes (code, owner_address, app_url, metadata_json, created_at, updated_at)
								VALUES (?, ?, ?, ?, ?, ?)
							`).run(
								code,
								'0x0000000000000000000000000000000000000000', // Placeholder until registered
								null,
								JSON.stringify({ name: code, description: 'Auto-discovered code' }),
								Date.now(),
								Date.now()
							);
							
							db.prepare(`
								INSERT OR IGNORE INTO tx_attributions (tx_hash, code, timestamp, value_eth, fee_estimate_eth)
								VALUES (?, ?, ?, ?, ?)
							`).run(
								tx.hash,
								code,
								Number(block.timestamp),
								valueEth,
								feeEstimateEth
							);
							attributionCount++;
						} catch (err) {
							// Skip duplicates
							console.warn(`Failed to insert attribution for ${code}:`, err);
						}
					}
				}
				scannedCount++;
			} catch (err) {
				console.error(`Error scanning block ${blockNum}:`, err);
			}
		}
		
		// Update last scanned block
		db.prepare(`
			INSERT OR REPLACE INTO indexer_state (key, value)
			VALUES (?, ?)
		`).run('last_block', endBlock.toString());
		
		// Aggregate stats
		const statsRows = db.prepare(`
			SELECT code, COUNT(*) as txCount, 
				COALESCE(SUM(CAST(value_eth AS REAL)), 0) as volumeEth, 
				COALESCE(SUM(CAST(fee_estimate_eth AS REAL)), 0) as feeEstimateEth 
			FROM tx_attributions 
			GROUP BY code
		`).all() as Array<any>;
		
		for (const row of statsRows) {
			db.prepare(`
				INSERT OR REPLACE INTO code_stats (code, tx_count, volume_eth, fee_estimate_eth, updated_at)
				VALUES (?, ?, ?, ?, ?)
			`).run(
				row.code,
				Number(row.txCount),
				String(row.volumeEth),
				String(row.feeEstimateEth),
				Date.now()
			);
		}
		
		return {
			statusCode: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({
				success: true,
				scannedBlocks: scannedCount,
				attributions: attributionCount,
				fromBlock: startBlock,
				toBlock: endBlock,
				currentBlock,
				statsUpdated: statsRows.length
			})
		};
	} catch (error: any) {
		console.error('Indexer error:', error);
		return {
			statusCode: 500,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({ 
				error: 'Internal server error', 
				message: error.message 
			})
		};
	}
};

