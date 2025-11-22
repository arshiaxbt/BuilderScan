import type { Handler } from '@netlify/functions';
import { JSONDatabase } from './db-json.js';

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

		const db = new JSONDatabase();
		
		// Check if code exists
		const codeData = db.getBuilderCode(code);
		if (!codeData) {
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
		
		const likes = db.updateLikes(code, delta);
		
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
