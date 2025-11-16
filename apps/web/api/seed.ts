import type { VercelRequest, VercelResponse } from '@vercel/node';
import DatabaseDriver from 'better-sqlite3';

function getDatabase() {
	const dbPath = '/tmp/builderscan.db';
	let db: DatabaseDriver.Database;
	
	try {
		db = new DatabaseDriver(dbPath);
	} catch (error) {
		db = new DatabaseDriver(dbPath);
	}
	
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
			likes INTEGER DEFAULT 0 NOT NULL,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
		)
	`).run();
	
	return db;
}

/**
 * Seed endpoint to populate initial data
 * Call this after deploying to initialize the database
 * GET /api/seed - Seeds demo data
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET' && req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const db = getDatabase();
		const now = Date.now();

		// Seed builder codes
		const codes = [
			{
				code: 'builderscan',
				ownerAddress: '0xcd0b67a61E5e8F4616c19e421e929813B6D947df',
				appUrl: null,
				metadataJson: JSON.stringify({ name: 'BuilderScan', description: 'Leaderboard mini app' })
			},
			{
				code: 'dexwiz',
				ownerAddress: '0x1111111111111111111111111111111111111111',
				appUrl: 'https://baseswap.example/dex?tab=swap',
				metadataJson: JSON.stringify({ name: 'DexWiz', description: 'Swap with smart routing' })
			},
			{
				code: 'lenderx',
				ownerAddress: '0x2222222222222222222222222222222222222222',
				appUrl: 'https://lenderx.example/app',
				metadataJson: JSON.stringify({ name: 'LenderX', description: 'Lend & borrow' })
			},
			{
				code: 'nftbazaar',
				ownerAddress: '0x3333333333333333333333333333333333333333',
				appUrl: 'https://nftbazaar.example',
				metadataJson: JSON.stringify({ name: 'NFT Bazaar', description: 'Marketplace' })
			}
		];

		for (const codeData of codes) {
			db.prepare(`
				INSERT OR REPLACE INTO builder_codes (code, owner_address, app_url, metadata_json, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`).run(
				codeData.code,
				codeData.ownerAddress,
				codeData.appUrl,
				codeData.metadataJson,
				now,
				now
			);
		}

		// Seed stats
		const stats = [
			{ code: 'builderscan', txCount: 1234, volumeEth: '45.67', feeEstimateEth: '0.023', likes: 42 },
			{ code: 'dexwiz', txCount: 5678, volumeEth: '842.12', feeEstimateEth: '0.421', likes: 128 },
			{ code: 'lenderx', txCount: 3456, volumeEth: '154.55', feeEstimateEth: '0.077', likes: 87 },
			{ code: 'nftbazaar', txCount: 238, volumeEth: '72.9', feeEstimateEth: '0.036', likes: 23 }
		];

		for (const stat of stats) {
			db.prepare(`
				INSERT OR REPLACE INTO code_stats (code, tx_count, volume_eth, fee_estimate_eth, likes, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`).run(
				stat.code,
				stat.txCount,
				stat.volumeEth,
				stat.feeEstimateEth,
				stat.likes,
				now
			);
		}

		return res.json({ 
			success: true, 
			message: 'Database seeded successfully',
			codes: codes.length,
			stats: stats.length
		});
	} catch (error: any) {
		console.error('Seed error:', error);
		return res.status(500).json({ error: 'Internal server error', message: error.message });
	}
}
