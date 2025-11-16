import 'dotenv/config';
import { ethers } from 'ethers';
import { Database } from '../lib/database.js';

// ERC-8021 parsing placeholder. Replace with exact schema 0 parsing when confirmed.
function extractBuilderCodeFromCalldata(data: string): string | null {
	// Heuristic: 8021 suffix commonly appended as ascii tag '|8021:' + code at end.
	// This is a placeholder and should be replaced with canonical parsing.
	try {
		if (!data || data === '0x') return null;
		// Try to decode tail as UTF-8 and find 8021 marker
		const bytes = ethers.getBytes(data);
		const utf8 = new TextDecoder().decode(bytes);
		const marker = '|8021:';
		const idx = utf8.lastIndexOf(marker);
		if (idx >= 0) {
			const code = utf8.slice(idx + marker.length).trim();
			if (code && code.length <= 64) return code;
		}
		return null;
	} catch {
		return null;
	}
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
				const code = extractBuilderCodeFromCalldata(tx.input as string);
				if (!code) continue;
				const valueEth = ethers.formatEther(tx.value ?? 0n);
				// naive fee estimate: 0.05% of value, fallback to 0
				const feeEstimateEth =
					tx.value && tx.value > 0n
						? (Number(valueEth) * 0.0005).toString()
						: '0';
				db.insertAttribution({
					txHash: tx.hash,
					code,
					timestamp: Number(block.timestamp),
					valueEth,
					feeEstimateEth
				});
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


