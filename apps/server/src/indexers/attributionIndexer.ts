import 'dotenv/config';
import { ethers } from 'ethers';
import { Database } from '../lib/database.js';

/**
 * ERC-8021 Attribution Parser
 * 
 * Parses transaction calldata to extract builder codes according to ERC-8021 spec.
 * 
 * Suffix format (parsed backwards from end):
 * {txData}{schemaData}{schemaId}{ercSuffix}
 * 
 * - ercSuffix: 16 bytes = 0x80218021802180218021802180218021 (repeated "8021")
 * - schemaId: 1 byte (0 = canonical registry, 1 = custom registry)
 * - schemaData: variable bytes depending on schemaId
 * 
 * Schema 0 (canonical registry):
 *   {codesLength}{codes}
 *   - codesLength: 1 byte
 *   - codes: ASCII string, comma-delimited (0x2C), no commas in codes
 * 
 * Schema 1 (custom registry):
 *   {codesLength}{codes}{codeRegistryChainIdLength}{codeRegistryChainId}{codeRegistryAddress}
 *   - Same as Schema 0, plus:
 *   - codeRegistryChainIdLength: 1 byte
 *   - codeRegistryChainId: variable bytes
 *   - codeRegistryAddress: 20 bytes
 */
const ERC_SUFFIX = '0x80218021802180218021802180218021'; // 16 bytes
const ERC_SUFFIX_BYTES = ethers.getBytes(ERC_SUFFIX);

function extractBuilderCodesFromCalldata(data: string): string[] {
	try {
		if (!data || data === '0x' || data.length < 66) return []; // Need at least ercSuffix (32 hex chars = 16 bytes)
		
		const bytes = ethers.getBytes(data);
		if (bytes.length < 17) return []; // Need at least ercSuffix (16 bytes) + schemaId (1 byte)
		
		// Check ercSuffix (last 16 bytes)
		const suffixStart = bytes.length - 16;
		const suffix = bytes.slice(suffixStart);
		if (!suffix.every((b, i) => b === ERC_SUFFIX_BYTES[i])) {
			return []; // Not an ERC-8021 transaction
		}
		
		// Extract schemaId (byte before suffix)
		const schemaId = bytes[suffixStart - 1];
		
		// Parse based on schemaId
		if (schemaId === 0) {
			// Schema 0: canonical registry
			return parseSchema0(bytes, suffixStart - 2);
		} else if (schemaId === 1) {
			// Schema 1: custom registry (we'll extract codes but use canonical registry for now)
			return parseSchema1(bytes, suffixStart - 2);
		}
		
		// Unknown schemaId - parsing stops per spec
		return [];
	} catch {
		return [];
	}
}

function parseSchema0(bytes: Uint8Array, pos: number): string[] {
	if (pos < 0) return [];
	
	// Extract codesLength
	const codesLength = bytes[pos];
	if (codesLength === 0 || pos < codesLength) return [];
	
	// Extract codes
	const codesStart = pos - codesLength;
	const codesBytes = bytes.slice(codesStart, pos);
	const codesStr = new TextDecoder('ascii').decode(codesBytes);
	
	// Split by comma (0x2C)
	return codesStr.split(',').filter(code => code.length > 0);
}

function parseSchema1(bytes: Uint8Array, pos: number): string[] {
	if (pos < 0) return [];
	
	// Extract codeRegistryAddress (20 bytes before current pos)
	if (pos < 20) return [];
	const registryAddressPos = pos - 20;
	
	// Extract codeRegistryChainIdLength (1 byte before address)
	if (registryAddressPos < 1) return [];
	const chainIdLength = bytes[registryAddressPos - 1];
	
	// Extract codeRegistryChainId (variable bytes)
	if (registryAddressPos - 1 < chainIdLength) return [];
	const chainIdStart = registryAddressPos - 1 - chainIdLength;
	
	// Extract codesLength (1 byte before chainId)
	if (chainIdStart < 1) return [];
	const codesLength = bytes[chainIdStart - 1];
	
	// Extract codes
	if (chainIdStart - 1 < codesLength) return [];
	const codesStart = chainIdStart - 1 - codesLength;
	const codesBytes = bytes.slice(codesStart, chainIdStart - 1);
	const codesStr = new TextDecoder('ascii').decode(codesBytes);
	
	// Split by comma (0x2C)
	return codesStr.split(',').filter(code => code.length > 0);
}

// Legacy function name for compatibility
function extractBuilderCodeFromCalldata(data: string): string | null {
	const codes = extractBuilderCodesFromCalldata(data);
	return codes.length > 0 ? codes[0] : null; // Return first code for backward compatibility
}

async function main() {
	if (!process.env.BASE_RPC_URL) throw new Error('BASE_RPC_URL missing');
	const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
	const db = new Database(process.env.DATABASE_PATH ?? 'builderscan.db');
	await db.init();

	const fromBlock = Number(process.env.START_BLOCK ?? 0);
	const current = await provider.getBlockNumber();

	// Scan blocks in windows
	const step = 25;
	for (let start = fromBlock; start <= current; start += step) {
		const end = Math.min(current, start + step - 1);
		const blocks: Array<ethers.Block> = [];
		for (let b = start; b <= end; b++) {
			// sequential to respect RPC batch limits
			const block = await provider.getBlock(b, true);
			if (block) blocks.push(block as any);
		}

		for (const block of blocks) {
			if (!block?.transactions) continue;
			for (const tx of block.transactions as any[]) {
				// Extract all codes from transaction (ERC-8021 supports multiple attributions)
				const codes = extractBuilderCodesFromCalldata(tx.input as string);
				if (codes.length === 0) continue;
				
				const valueEth = ethers.formatEther(tx.value ?? 0n);
				// naive fee estimate: 0.05% of value, fallback to 0
				// Note: ERC-8021 spec doesn't define fee calculation, this is illustrative
				const feeEstimateEth =
					tx.value && tx.value > 0n
						? (Number(valueEth) * 0.0005).toString()
						: '0';
				
				// Attribute transaction to all codes found
				for (const code of codes) {
					db.insertAttribution({
						txHash: tx.hash,
						code,
						timestamp: Number(block.timestamp),
						valueEth,
						feeEstimateEth
					});
				}
			}
		}
		console.log(`Scanned blocks ${start}-${end}`);
	}

	// Aggregate stats
	const codesStmt = (db as any).driver.prepare(
		`SELECT code, COUNT(*) as txCount, COALESCE(SUM(value_eth + 0.0), 0) as volumeEth, COALESCE(SUM(fee_estimate_eth + 0.0), 0) as feeEstimateEth FROM tx_attributions GROUP BY code`
	);
	const rows = codesStmt.all() as Array<any>;
	for (const row of rows) {
		db.updateCodeStats({
			code: row.code,
			txCount: Number(row.txCount),
			volumeEth: String(row.volumeEth),
			feeEstimateEth: String(row.feeEstimateEth)
		});
	}
	console.log(`Aggregated stats for ${rows.length} codes`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


