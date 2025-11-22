import type { Handler } from '@netlify/functions';

/**
 * Farcaster.json endpoint - serves the hosted manifest directly
 * This ensures Farcaster gets the exact manifest content
 */
export const handler: Handler = async (event, context) => {
	const HOSTED_MANIFEST_URL = 'https://api.farcaster.xyz/miniapps/hosted-manifest/019aac77-a581-0edd-2956-e2ce7de88d60';

	try {
		// Fetch the hosted manifest from Farcaster
		const response = await fetch(HOSTED_MANIFEST_URL);

		if (!response.ok) {
			return {
				statusCode: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				},
				body: JSON.stringify({ error: 'Failed to fetch hosted manifest' })
			};
		}

		const manifestData = await response.text();

		return {
			statusCode: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
			},
			body: manifestData
		};
	} catch (error) {
		console.error('Error fetching hosted manifest:', error);
		return {
			statusCode: 500,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			},
			body: JSON.stringify({ error: 'Internal server error' })
		};
	}
};
