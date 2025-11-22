import type { Handler } from '@netlify/functions';

/**
 * Farcaster.json endpoint for Base.dev submission
 * Served at: https://your-site.netlify.app/.well-known/farcaster.json
 */
export const handler: Handler = async (event, context) => {
	const host = event.headers.host || event.headers['x-forwarded-host'] || 'builder-scan.netlify.app';
	const appUrl = `https://${host}`;
	const canonicalDomain = host.replace(/^https?:\/\//, '');
	
	// Base.dev manifest format
	// accountAssociation must be signed via Base Build Preview Tool at base.dev
	const manifest: any = {
		// accountAssociation will be added after signing via Base.dev Preview tool
		// Visit: https://base.dev → Preview → Account Association
		accountAssociation: null, // To be filled after signing
		baseBuilder: {
			ownerAddress: "0x7B29A3b61dA6e93633CB58b66e15A457d27f02D5"
		},
		miniapp: {
			version: "1",
			name: "BuilderScan",
			description: "ERC-8021 Builder Code Leaderboard on Base",
			iconUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
			homeUrl: appUrl,
			canonicalDomain: canonicalDomain,
			requiredChains: ["eip155:8453"], // Base mainnet
			tags: ["leaderboard", "erc-8021", "base"],
			requiredCapabilities: [
				"actions.ready",
				"actions.signIn"
			]
		}
	};
	
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

