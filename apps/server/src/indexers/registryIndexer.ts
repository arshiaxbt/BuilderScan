import 'dotenv/config';
import { ethers } from 'ethers';
import { Database } from '../lib/database.js';

/**
 * ERC-8021 Code Registry Indexer
 * 
 * REGISTRY_ADDRESS: The address of the ICodeRegistry contract on Base (Chain ID 8453)
 * 
 * According to ERC-8021 spec:
 * - Chain ID 8453 (Base mainnet): TBD (To Be Determined)
 * - Chain ID 84532 (Base Sepolia testnet): TBD
 * 
 * The registry implements ICodeRegistry interface:
 * - payoutAddress(string code) returns (address) - where rewards are sent
 * - codeURI(string code) returns (string) - metadata URI
 * - isValidCode(string code) returns (bool) - format validation
 * - isRegistered(string code) returns (bool) - registration check
 * 
 * Note: The spec doesn't define events, so this indexer assumes events exist
 * for code registration/updates. When the canonical registry is deployed,
 * update this ABI to match the actual contract interface.
 */
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as string;
const REGISTRY_ABI = [
	// ICodeRegistry interface (view functions)
	'function payoutAddress(string memory code) external view returns (address)',
	'function codeURI(string memory code) external view returns (string)',
	'function isValidCode(string memory code) external view returns (bool)',
	'function isRegistered(string memory code) external view returns (bool)',
	// Assumed events (update when canonical registry is deployed)
	'event Registered(string indexed code, address indexed owner)',
	'event Updated(string indexed code, address indexed owner)'
];

async function main() {
	if (!process.env.BASE_RPC_URL) throw new Error('BASE_RPC_URL missing');
	if (!REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS missing');

	const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
	const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
	const db = new Database(process.env.DATABASE_PATH ?? 'builderscan.db');
	await db.init();

	const fromBlock = Number(process.env.START_BLOCK ?? 0);
	const current = await provider.getBlockNumber();

	const filterRegistered = registry.filters.Registered();
	const filterUpdated = registry.filters.Updated();

	const [registeredLogs, updatedLogs] = await Promise.all([
		registry.queryFilter(filterRegistered, fromBlock, current),
		registry.queryFilter(filterUpdated, fromBlock, current)
	]);

	for (const log of registeredLogs as ethers.EventLog[]) {
		const { code, owner, metadataURI, appUrl } = (log.args as any) ?? {};
		db.upsertBuilderCode({
			code,
			ownerAddress: owner,
			appUrl: appUrl ?? null,
			metadataJson: metadataURI ? JSON.stringify({ metadataURI }) : null
		});
	}

	for (const log of updatedLogs as ethers.EventLog[]) {
		const { code, owner, metadataURI, appUrl } = (log.args as any) ?? {};
		db.upsertBuilderCode({
			code,
			ownerAddress: owner,
			appUrl: appUrl ?? null,
			metadataJson: metadataURI ? JSON.stringify({ metadataURI }) : null
		});
	}

	console.log(
		`Indexed registry logs. Registered: ${registeredLogs.length}, Updated: ${updatedLogs.length}`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


