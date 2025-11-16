import DatabaseDriver from 'better-sqlite3';

export type BuilderCode = {
	code: string;
	ownerAddress: string;
	appUrl: string | null;
	metadataJson: string | null;
	createdAt: number;
	updatedAt: number;
};

export type CodeStats = {
	code: string;
	txCount: number;
	volumeEth: string; // store as string to avoid FP issues
	feeEstimateEth: string;
	updatedAt: number;
};

export class Database {
	private driver: DatabaseDriver.Database;

	constructor(filePath: string) {
		this.driver = new DatabaseDriver(filePath);
		this.driver.pragma('journal_mode = WAL');
	}

	async init(): Promise<void> {
		this.driver
			.prepare(
				`
        CREATE TABLE IF NOT EXISTS builder_codes (
          code TEXT PRIMARY KEY,
          owner_address TEXT NOT NULL,
          app_url TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `
			)
			.run();

		this.driver
			.prepare(
				`
        CREATE TABLE IF NOT EXISTS code_stats (
          code TEXT PRIMARY KEY,
          tx_count INTEGER NOT NULL,
          volume_eth TEXT NOT NULL,
          fee_estimate_eth TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
        );
      `
			)
			.run();

		this.driver
			.prepare(
				`
        CREATE TABLE IF NOT EXISTS tx_attributions (
          tx_hash TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          value_eth TEXT NOT NULL,
          fee_estimate_eth TEXT NOT NULL,
          FOREIGN KEY (code) REFERENCES builder_codes(code) ON DELETE CASCADE
        );
      `
			)
			.run();
	}

	upsertBuilderCode(input: Omit<BuilderCode, 'createdAt' | 'updatedAt'>): void {
		const now = Date.now();
		this.driver
			.prepare(
				`
        INSERT INTO builder_codes (code, owner_address, app_url, metadata_json, created_at, updated_at)
        VALUES (@code, @ownerAddress, @appUrl, @metadataJson, @now, @now)
        ON CONFLICT(code) DO UPDATE SET
          owner_address=excluded.owner_address,
          app_url=excluded.app_url,
          metadata_json=excluded.metadata_json,
          updated_at=excluded.updated_at
      `
			)
			.run({ ...input, now });
	}

	updateCodeStats(input: Omit<CodeStats, 'updatedAt'>): void {
		const now = Date.now();
		this.driver
			.prepare(
				`
        INSERT INTO code_stats (code, tx_count, volume_eth, fee_estimate_eth, updated_at)
        VALUES (@code, @txCount, @volumeEth, @feeEstimateEth, @now)
        ON CONFLICT(code) DO UPDATE SET
          tx_count=excluded.tx_count,
          volume_eth=excluded.volume_eth,
          fee_estimate_eth=excluded.fee_estimate_eth,
          updated_at=excluded.updated_at
      `
			)
			.run({ ...input, now });
	}

	insertAttribution(input: {
		txHash: string;
		code: string;
		timestamp: number;
		valueEth: string;
		feeEstimateEth: string;
	}): void {
		this.driver
			.prepare(
				`
        INSERT OR IGNORE INTO tx_attributions (tx_hash, code, timestamp, value_eth, fee_estimate_eth)
        VALUES (@txHash, @code, @timestamp, @valueEth, @feeEstimateEth)
      `
			)
			.run(input);
	}

	getLeaderboard(limit = 50): Array<{
		code: string;
		txCount: number;
		volumeEth: string;
		feeEstimateEth: string;
		appUrl: string | null;
		ownerAddress: string;
	}> {
		const rows = this.driver
			.prepare(
				`
        SELECT s.code, s.tx_count as txCount, s.volume_eth as volumeEth, s.fee_estimate_eth as feeEstimateEth,
               c.app_url as appUrl, c.owner_address as ownerAddress
        FROM code_stats s
        JOIN builder_codes c ON c.code = s.code
        ORDER BY s.fee_estimate_eth + 0.0 DESC, s.volume_eth + 0.0 DESC
        LIMIT ?
      `
			)
			.all(limit);
		return rows as any;
	}

	getCode(code: string): BuilderCode | undefined {
		const row = this.driver
			.prepare(
				`SELECT code, owner_address as ownerAddress, app_url as appUrl, metadata_json as metadataJson, created_at as createdAt, updated_at as updatedAt FROM builder_codes WHERE code = ?`
			)
			.get(code);
		return row as any;
	}
}


