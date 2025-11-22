import type { Handler } from '@netlify/functions';

/**
 * Farcaster.json endpoint for Base.dev submission
 * Served at: https://your-site.netlify.app/.well-known/farcaster.json
 */
export const handler: Handler = async (event, context) => {
	const host = event.headers.host || event.headers['x-forwarded-host'] || 'builder-scan.netlify.app';
	const appUrl = `https://${host}`;
	const canonicalDomain = host.replace(/^https?:\/\//, '');
	
	// Base.dev manifest format - uses "frame" not "miniapp"
	// accountAssociation must be signed via Base Build Preview Tool at base.dev
	const manifest: any = {
		baseBuilder: {
			ownerAddress: "0x7B29A3b61dA6e93633CB58b66e15A457d27f02D5"
		},
		frame: {
			version: "1",
			name: "BuilderScan",
			homeUrl: appUrl,
			iconUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
			splashImageUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
			splashBackgroundColor: "#000000",
			primaryCategory: "social",
			tags: ["leaderboard", "erc8021", "base"]
		}
	};
	
	// Add accountAssociation only if signed (can be added later via env var or config)
	const accountAssociation = process.env.ACCOUNT_ASSOCIATION;
	if (accountAssociation) {
		try {
			manifest.accountAssociation = JSON.parse(accountAssociation);
		} catch {
			// Invalid JSON, skip
		}
	}
	
	return {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=3600'
		},
		body: JSON.stringify(manifest)
	};
};

