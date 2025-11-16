import { Router } from 'express';
import { Database } from '../lib/database.js';
import { ethers } from 'ethers';

export function interactionsRouter(db: Database): Router {
	const router = Router();

	// Like/unlike a code (delta = +1 or -1)
	router.post('/:code/like', (req, res) => {
		const code = req.params.code;
		const delta = Math.max(-1, Math.min(1, Number(req.body?.delta ?? 1)));
		if (!db.getCode(code)) return res.status(404).json({ error: 'Not found' });
		const likes = db.incrementLike(code, delta);
		res.json({ code, likes });
	});

	// Get likes
	router.get('/:code/likes', (req, res) => {
		const code = req.params.code;
		if (!db.getCode(code)) return res.status(404).json({ error: 'Not found' });
		res.json({ code, likes: db.getLikes(code) });
	});

	// Simulate a donation transaction payload (not broadcasting, not signing)
	router.post('/:code/donate/simulate', (req, res) => {
		const code = req.params.code;
		const amountEth = String(req.body?.amountEth ?? '');
		const codeRow = db.getCode(code);
		if (!codeRow) return res.status(404).json({ error: 'Not found' });
		if (!amountEth || Number.isNaN(Number(amountEth)) || Number(amountEth) <= 0) {
			return res.status(400).json({ error: 'Invalid amountEth' });
		}
		const value = ethers.parseEther(amountEth).toString();
		// Append a lightweight ERC-8021-like suffix in data (placeholder schema-0 tag)
		const ourCode = process.env.OUR_BUILDER_CODE ?? 'builderscan';
		const suffixUtf8 = `|8021:${ourCode}`;
		const data = ethers.hexlify(ethers.toUtf8Bytes(suffixUtf8));
		// Construct a tx that wallets can simulate; to = ownerAddress
		const tx = {
			to: codeRow.ownerAddress,
			value,
			data
		};
		return res.json({ tx, note: 'For simulation only. No signing required by this endpoint.' });
	});

	return router;
}


