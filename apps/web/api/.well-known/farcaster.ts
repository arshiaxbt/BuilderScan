import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Farcaster.json endpoint for Base.dev submission
 * Served at: https://builderscan.vercel.app/.well-known/farcaster.json
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
	// Set proper headers
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
	
	return res.json({
		version: "1.0",
		name: "BuilderScan",
		description: "ERC-8021 Builder Code Leaderboard on Base",
		iconUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
		appUrl: "https://builderscan.vercel.app/",
		splashImageUrl: "https://thick-emerald-possum.myfilebase.com/ipfs/QmbRhHs6rrbpG7J2TrAK8JVaCaiT9SHEaPWHPBzNajWbUW",
		splashBackgroundColor: "#000000"
	});
}

