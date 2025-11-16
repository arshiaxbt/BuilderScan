import { Router } from 'express';
import { Database } from '../lib/database.js';

export function leaderboardRouter(db: Database): Router {
	const router = Router();

	router.get('/', (req, res) => {
		const limit = req.query.limit ? Number(req.query.limit) : 50;
		const rows = db.getLeaderboard(limit);
		res.json({ items: rows });
	});

	return router;
}


