import type { Handler } from '@netlify/functions';
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
	if (event.httpMethod !== 'POST') {
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
		// Extract code from path: /api/interactions/:code/like
		const pathMatch = event.path.match(/\/interactions\/([^\/]+)\/like/);
		const code = pathMatch ? pathMatch[1] : null;
		
		if (!code) {
			return {
				statusCode: 400,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				},
				body: JSON.stringify({ error: 'Code parameter required' })
			};
		}

		const db = getDatabase();
		
		// Check if code exists
		const codeRow = db.prepare('SELECT code FROM builder_codes WHERE code = ?').get(code);
		if (!codeRow) {
			return {
				statusCode: 404,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				},
				body: JSON.stringify({ error: 'Code not found' })
			};
		}

		const body = event.body ? JSON.parse(event.body) : {};
		const delta = Math.max(-1, Math.min(1, Number(body.delta ?? 1)));
		const now = Date.now();
		
		// Ensure stats row exists
		db.prepare(`
			INSERT OR IGNORE INTO code_stats (code, tx_count, volume_eth, fee_estimate_eth, likes, updated_at)
			VALUES (?, 0, '0', '0', 0, ?)
		`).run(code, now);
		
		// Update likes
		db.prepare(`
			UPDATE code_stats 
			SET likes = MAX(0, likes + ?), updated_at = ?
			WHERE code = ?
		`).run(delta, now, code);
		
		const result = db.prepare('SELECT likes FROM code_stats WHERE code = ?').get(code) as { likes: number } | undefined;
		const likes = result?.likes ?? 0;
		
		return {
			statusCode: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({ code, likes })
		};
	} catch (error: any) {
		console.error('Like error:', error);
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

