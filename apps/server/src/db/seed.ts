import 'dotenv/config';
import { Database } from '../lib/database.js';

async function main() {
	const db = new Database(process.env.DATABASE_PATH ?? 'builderscan.db');
	await db.init();

	// Ensure our builder code maps to user's rewards address
	db.upsertBuilderCode({
		code: process.env.OUR_BUILDER_CODE ?? 'builderscan',
		ownerAddress: '0xcd0b67a61E5e8F4616c19e421e929813B6D947df',
		appUrl: 'https://builderscan.example',
		metadataJson: JSON.stringify({ name: 'BuilderScan', description: 'Leaderboard mini app' })
	});

	// Seed a few example builder codes and stats
	db.upsertBuilderCode({
		code: 'dexwiz',
		ownerAddress: '0x1111111111111111111111111111111111111111',
		appUrl: 'https://baseswap.example/dex?tab=swap',
		metadataJson: JSON.stringify({ name: 'DexWiz', description: 'Swap with smart routing' })
	});
	db.updateCodeStats({
		code: 'dexwiz',
		txCount: 1284,
		volumeEth: '842.1234',
		feeEstimateEth: '0.4210'
	});

	db.upsertBuilderCode({
		code: 'lenderx',
		ownerAddress: '0x2222222222222222222222222222222222222222',
		appUrl: 'https://lenderx.example/app',
		metadataJson: JSON.stringify({ name: 'LenderX', description: 'Lend & borrow' })
	});
	db.updateCodeStats({
		code: 'lenderx',
		txCount: 532,
		volumeEth: '154.55',
		feeEstimateEth: '0.077'
	});

	db.upsertBuilderCode({
		code: 'nftbazaar',
		ownerAddress: '0x3333333333333333333333333333333333333333',
		appUrl: 'https://nftbazaar.example',
		metadataJson: JSON.stringify({ name: 'NFT Bazaar', description: 'Marketplace' })
	});
	db.updateCodeStats({
		code: 'nftbazaar',
		txCount: 238,
		volumeEth: '72.9',
		feeEstimateEth: '0.036'
	});

	console.log('Seeded demo data.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


