import type { Handler } from '@netlify/functions';
import { JSONDatabase } from './db-json.js';

/**
 * Netlify Serverless Function for Leaderboard API
 * 
 * Uses JSON-based database to avoid GLIBC compatibility issues
 */
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
		const db = new JSONDatabase();
		const queryParams = new URLSearchParams(event.queryStringParameters || {});
		const limit = queryParams.get('limit') ? Number(queryParams.get('limit')) : 50;
		
		// Get leaderboard - only show codes with real stats from tx_attributions
		const items = db.getLeaderboard(limit);
		
		return {
			statusCode: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
			},
			body: JSON.stringify({ items })
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
