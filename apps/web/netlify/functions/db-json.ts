import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * JSON-based database for Netlify Functions
 * Replaces better-sqlite3 to avoid GLIBC compatibility issues
 */

const DB_PATH = '/tmp/builderscan.json';

interface Database {
	builder_codes: Record<string, {
		code: string;
		owner_address: string;
		app_url: string | null;
		metadata_json: string | null;
		created_at: number;
		updated_at: number;
	}>;
	code_stats: Record<string, {
		code: string;
		tx_count: number;
		volume_eth: string;
		fee_estimate_eth: string;
		likes: number;
		updated_at: number;
	}>;
	tx_attributions: Record<string, {
		tx_hash: string;
		code: string;
		timestamp: number;
		value_eth: string;
		fee_estimate_eth: string;
	}>;
	code_likes: Record<string, {
		code: string;
		likes: number;
		updated_at: number;
	}>;
	indexer_state: Record<string, string>;
}

function loadDB(): Database {
	if (existsSync(DB_PATH)) {
		try {
			const data = readFileSync(DB_PATH, 'utf-8');
			return JSON.parse(data);
		} catch {
			// If corrupted, return empty DB
		}
	}
	return {
		builder_codes: {},
		code_stats: {},
		tx_attributions: {},
		code_likes: {},
		indexer_state: {}
	};
}

function saveDB(db: Database): void {
	try {
		writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
	} catch (error) {
		console.error('Failed to save database:', error);
	}
}

export class JSONDatabase {
	private db: Database;

	constructor() {
		this.db = loadDB();
	}

	// Builder codes
	upsertBuilderCode(code: string, ownerAddress: string, appUrl: string | null, metadataJson: string | null): void {
		const now = Date.now();
		this.db.builder_codes[code] = {
			code,
			owner_address: ownerAddress,
			app_url: appUrl,
			metadata_json: metadataJson,
			created_at: this.db.builder_codes[code]?.created_at || now,
			updated_at: now
		};
		saveDB(this.db);
	}

	getBuilderCode(code: string): { code: string; owner_address: string; app_url: string | null } | null {
		const codeData = this.db.builder_codes[code];
		if (!codeData) return null;
		return {
			code: codeData.code,
			owner_address: codeData.owner_address,
			app_url: codeData.app_url
		};
	}

	// Code stats
	updateCodeStats(code: string, txCount: number, volumeEth: string, feeEstimateEth: string): void {
		const now = Date.now();
		if (!this.db.code_stats[code]) {
			this.db.code_stats[code] = {
				code,
				tx_count: 0,
				volume_eth: '0',
				fee_estimate_eth: '0',
				likes: 0,
				updated_at: now
			};
		}
		this.db.code_stats[code].tx_count = txCount;
		this.db.code_stats[code].volume_eth = volumeEth;
		this.db.code_stats[code].fee_estimate_eth = feeEstimateEth;
		this.db.code_stats[code].updated_at = now;
		saveDB(this.db);
	}

	getCodeStats(code: string): { tx_count: number; volume_eth: string; fee_estimate_eth: string; likes: number } | null {
		const stats = this.db.code_stats[code];
		if (!stats) return null;
		const likes = this.db.code_likes[code]?.likes || 0;
		return {
			tx_count: stats.tx_count,
			volume_eth: stats.volume_eth,
			fee_estimate_eth: stats.fee_estimate_eth,
			likes
		};
	}

	// Attributions
	insertAttribution(txHash: string, code: string, timestamp: number, valueEth: string, feeEstimateEth: string): void {
		if (this.db.tx_attributions[txHash]) return; // Already exists
		this.db.tx_attributions[txHash] = {
			tx_hash: txHash,
			code,
			timestamp,
			value_eth: valueEth,
			fee_estimate_eth: feeEstimateEth
		};
		saveDB(this.db);
	}

	// Aggregations
	aggregateStats(): void {
		const statsByCode: Record<string, { txCount: number; volumeEth: number; feeEstimateEth: number }> = {};
		
		for (const attr of Object.values(this.db.tx_attributions)) {
			if (!statsByCode[attr.code]) {
				statsByCode[attr.code] = { txCount: 0, volumeEth: 0, feeEstimateEth: 0 };
			}
			statsByCode[attr.code].txCount++;
			statsByCode[attr.code].volumeEth += parseFloat(attr.value_eth) || 0;
			statsByCode[attr.code].feeEstimateEth += parseFloat(attr.fee_estimate_eth) || 0;
		}

		for (const [code, stats] of Object.entries(statsByCode)) {
			this.updateCodeStats(code, stats.txCount, stats.volumeEth.toString(), stats.feeEstimateEth.toString());
		}
	}

	getLeaderboard(limit: number): Array<{
		code: string;
		txCount: number;
		volumeEth: string;
		feeEstimateEth: string;
		likes: number;
		appUrl: string | null;
		ownerAddress: string;
	}> {
		const items: Array<{
			code: string;
			txCount: number;
			volumeEth: string;
			feeEstimateEth: string;
			likes: number;
			appUrl: string | null;
			ownerAddress: string;
		}> = [];

		for (const [code, stats] of Object.entries(this.db.code_stats)) {
			if (stats.tx_count === 0) continue;
			const codeData = this.db.builder_codes[code];
			if (!codeData) continue;
			
			const likes = this.db.code_likes[code]?.likes || 0;
			items.push({
				code,
				txCount: stats.tx_count,
				volumeEth: stats.volume_eth,
				feeEstimateEth: stats.fee_estimate_eth,
				likes,
				appUrl: codeData.app_url,
				ownerAddress: codeData.owner_address
			});
		}

		// Sort by fee_estimate_eth DESC, then volume_eth DESC
		items.sort((a, b) => {
			const feeA = parseFloat(a.feeEstimateEth) || 0;
			const feeB = parseFloat(b.feeEstimateEth) || 0;
			if (feeA !== feeB) return feeB - feeA;
			const volA = parseFloat(a.volumeEth) || 0;
			const volB = parseFloat(b.volumeEth) || 0;
			return volB - volA;
		});

		return items.slice(0, limit);
	}

	// Likes
	updateLikes(code: string, delta: number): number {
		const now = Date.now();
		if (!this.db.code_likes[code]) {
			this.db.code_likes[code] = { code, likes: 0, updated_at: now };
		}
		this.db.code_likes[code].likes = Math.max(0, this.db.code_likes[code].likes + delta);
		this.db.code_likes[code].updated_at = now;
		
		// Also update in stats if exists
		if (this.db.code_stats[code]) {
			this.db.code_stats[code].likes = this.db.code_likes[code].likes;
		}
		
		saveDB(this.db);
		return this.db.code_likes[code].likes;
	}

	getLikes(code: string): number {
		return this.db.code_likes[code]?.likes || 0;
	}

	// Indexer state
	setState(key: string, value: string): void {
		this.db.indexer_state[key] = value;
		saveDB(this.db);
	}

	getState(key: string): string | null {
		return this.db.indexer_state[key] || null;
	}
}

