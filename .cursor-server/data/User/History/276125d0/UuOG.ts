import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Database } from './lib/database.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { codesRouter } from './routes/codes.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

const db = new Database(process.env.DATABASE_PATH ?? ':memory:');
await db.init();

app.use('/api/leaderboard', leaderboardRouter(db));
app.use('/api/codes', codesRouter(db));

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
	console.log(`server listening on http://localhost:${port}`);
});


