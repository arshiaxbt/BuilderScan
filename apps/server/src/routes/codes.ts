import { Router } from 'express';
import { Database } from '../lib/database.js';

export function codesRouter(db: Database): Router {
	const router = Router();

	router.get('/:code', (req, res) => {
		const row = db.getCode(req.params.code);
		if (!row) return res.status(404).json({ error: 'Not found' });
		res.json(row);
	});

	return router;
}


