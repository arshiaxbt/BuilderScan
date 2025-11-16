import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Database } from './lib/database.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { codesRouter } from './routes/codes.js';
import { interactionsRouter } from './routes/interactions.js';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

const db = new Database(process.env.DATABASE_PATH ?? ':memory:');
await db.init();

app.use('/api/leaderboard', leaderboardRouter(db));
app.use('/api/codes', codesRouter(db));
app.use('/api/interactions', interactionsRouter(db));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve built frontend (SPA) from apps/web/dist
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
	res.sendFile(path.join(webDist, 'index.html'));
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
	console.log(`server listening on http://localhost:${port}`);
});


