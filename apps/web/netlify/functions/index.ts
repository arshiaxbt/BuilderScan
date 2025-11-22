import type { Handler } from '@netlify/functions';
import { ethers } from 'ethers';
import { JSONDatabase } from './db-json.js';

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
		const db = new JSONDatabase();
		
		// Get last scanned block
		const lastBlockStr = db.getState('last_block');
		const fromBlock = lastBlockStr ? Number(lastBlockStr) : 0;
		
		const currentBlock = await provider.getBlockNumber();
		
		// If starting fresh, start from recent blocks (configurable via env)
		// Default: 1 day ago (~43,200 blocks at 2s block time)
		const START_BLOCK_ENV = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;
		const blocksPerDay = 43200; // Base has ~2s block time = 43,200 blocks/day
			const daysBack = process.env.SCAN_DAYS_BACK ? Number(process.env.SCAN_DAYS_BACK) : 7; // 7 days for initial population // Default: 1 day
		
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
		
		// Scan blocks in reasonable batches to avoid 30s timeout
		// Netlify functions timeout after 30s, so limit to ~300 blocks max
		// With 15min intervals, we can catch up over time
			const maxBlocks = 200;
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
							const existingCode = db.getBuilderCode(code);
							if (!existingCode) {
								db.upsertBuilderCode(
									code,
									'0x0000000000000000000000000000000000000000', // Placeholder until registered
									null,
									JSON.stringify({ name: code, description: 'Auto-discovered code' })
								);
							}
							
							db.insertAttribution(
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
		db.setState('last_block', endBlock.toString());
		
		// Aggregate stats
		db.aggregateStats();
		
		// Count stats for response
		const statsCount = Object.keys(db.db.code_stats).length;
		
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
				statsUpdated: statsCount
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
