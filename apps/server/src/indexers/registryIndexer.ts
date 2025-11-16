import 'dotenv/config';
import { ethers } from 'ethers';
import { Database } from '../lib/database.js';

// Placeholder ABI and address. Replace when canonical registry ABI/address is confirmed.
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as string;
const REGISTRY_ABI = [
	// event Registered(string indexed code, address indexed owner, string metadataURI, string appUrl)
	'event Registered(string indexed code, address indexed owner, string metadataURI, string appUrl)',
	// event Updated(string indexed code, address indexed owner, string metadataURI, string appUrl)
	'event Updated(string indexed code, address indexed owner, string metadataURI, string appUrl)'
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


