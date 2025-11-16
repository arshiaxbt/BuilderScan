import type { VercelRequest, VercelResponse } from '@vercel/node';
import DatabaseDriver from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Vercel Serverless Function for Leaderboard API
 * 
 * Note: SQLite in /tmp is ephemeral. For production, consider:
 * - Vercel Postgres (recommended)
 * - Turso (serverless SQLite)
 * - PlanetScale
 * - Supabase
 * 
 * For now, this uses a persistent file in /tmp that survives warm starts.
 * On cold starts, the database will be empty unless seeded.
 */
function getDatabase() {
	// Use /tmp which is writable in Vercel serverless functions
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
	
	return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const db = getDatabase();
		const limit = req.query.limit ? Number(req.query.limit) : 50;
		
		// Get leaderboard with proper joins and handle missing stats
		const rows = db.prepare(`
			SELECT 
				c.code,
				COALESCE(s.tx_count, 0) as txCount,
				COALESCE(s.volume_eth, '0') as volumeEth,
				COALESCE(s.fee_estimate_eth, '0') as feeEstimateEth,
				COALESCE(s.likes, 0) as likes,
				c.app_url as appUrl,
				c.owner_address as ownerAddress
			FROM builder_codes c
			LEFT JOIN code_stats s ON s.code = c.code
			ORDER BY (s.fee_estimate_eth + 0.0) DESC, (s.volume_eth + 0.0) DESC, c.code ASC
			LIMIT ?
		`).all(limit);
		
		res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
		return res.json({ items: rows });
	} catch (error: any) {
		console.error('Leaderboard error:', error);
		return res.status(500).json({ error: 'Internal server error', message: error.message });
	}
}

