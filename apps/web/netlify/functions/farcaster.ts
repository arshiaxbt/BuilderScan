import type { Handler } from '@netlify/functions';

/**
 * Farcaster.json endpoint for Base.dev submission
 * Served at: https://your-site.netlify.app/.well-known/farcaster.json
 */
export const handler: Handler = async (event, context) => {
	const host = event.headers.host || event.headers['x-forwarded-host'] || 'builder-scan.netlify.app';
	const appUrl = `https://${host}`;
	const canonicalDomain = host.replace(/^https?:\/\//, '');
	
	// Base.dev manifest format per https://docs.base.org/mini-apps/core-concepts/manifest
	// Field order: accountAssociation, baseBuilder, miniapp
	const manifest: any = {
		accountAssociation: {
			header: "eyJmaWQiOjc2MzMsInR5cGUiOiJhdXRoIiwia2V5IjoiMHhENEYyNTdhZDFkNWZFMTcxQjJiOTk5NWMzNDQyYzA4QkE3QzQzNDBBIn0",
			payload: "eyJkb21haW4iOiJidWlsZGVyLXNjYW4ubmV0bGlmeS5hcHAifQ",
			signature: "kBX+njOzLLXlXlodiO/WoPEHfWkKj3brr81cPhn6tfMZMEtiRRkDhjrk6obGmkhzGfHu0weDzE5dFuSig/2mexw="
		},
		baseBuilder: {
			ownerAddress: "0x7B29A3b61dA6e93633CB58b66e15A457d27f02D5"
		},
		miniapp: {
			version: "1",
			name: "BuilderScan",
			subtitle: "ERC-8021 Builder Leaderboard", // REQUIRED - max 30 chars
			description: "ERC-8021 Builder Code Leaderboard on Base. Track and discover top builders on Base network.",
			homeUrl: appUrl,
			iconUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
			splashImageUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
			splashBackgroundColor: "#000000",
			primaryCategory: "social",
			tags: ["leaderboard", "erc8021", "base", "builder", "tracking"]
		}
	};
	
	return {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-cache, no-store, must-revalidate', // No cache for Base.dev verification
			'Pragma': 'no-cache',
			'Expires': '0'
		},
		body: JSON.stringify(manifest)
	};
};

