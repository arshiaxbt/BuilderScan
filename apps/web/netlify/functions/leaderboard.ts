import type { Handler } from '@netlify/functions';
import DatabaseDriver from 'better-sqlite3';

/**
 * Netlify Serverless Function for Leaderboard API
 * 
 * Note: SQLite in /tmp is ephemeral. For production, consider:
 * - Netlify Postgres (via addon)
 * - Turso (serverless SQLite)
 * - PlanetScale
 * - Supabase
 */
function getDatabase() {
	// Use /tmp which is writable in Netlify serverless functions
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
	
	db.prepare(`
		CREATE TABLE IF NOT EXISTS code_likes (
			code TEXT PRIMARY KEY,
			likes INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL,
			FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
		)
	`).run();
	
	return db;
}

export const handler: Handler = async (event, context) => {
	if (event.httpMethod !== 'GET') {
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
		const db = getDatabase();
		const queryParams = new URLSearchParams(event.queryStringParameters || {});
		const limit = queryParams.get('limit') ? Number(queryParams.get('limit')) : 50;
		
		// Get leaderboard - only show codes with real stats from tx_attributions
		const rows = db.prepare(`
			SELECT 
				s.code,
				s.tx_count as txCount,
				s.volume_eth as volumeEth,
				s.fee_estimate_eth as feeEstimateEth,
				COALESCE(l.likes, 0) as likes,
				c.app_url as appUrl,
				c.owner_address as ownerAddress
			FROM code_stats s
			JOIN builder_codes c ON c.code = s.code
			LEFT JOIN code_likes l ON l.code = s.code
			WHERE s.tx_count > 0
			ORDER BY (s.fee_estimate_eth + 0.0) DESC, (s.volume_eth + 0.0) DESC, s.code ASC
			LIMIT ?
		`).all(limit);
		
		return {
			statusCode: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
			},
			body: JSON.stringify({ items: rows })
		};
	} catch (error: any) {
		console.error('Leaderboard error:', error);
		return {
			statusCode: 500,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({ error: 'Internal server error', message: error.message })
		};
	}
};

