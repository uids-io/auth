import express from 'express';
import { requireAuth } from '../../src/index.js';

const app = express();
app.use(express.json());

app.use(
  requireAuth({
    issuer: process.env.ISSUER ?? 'http://localhost:3000',
    audience: process.env.API_AUDIENCE ?? 'http://localhost:4000',
    jwksUrl: `${process.env.ISSUER ?? 'http://localhost:3000'}/.well-known/jwks.json`,
  }),
);

app.get('/me', (req, res) => {
  res.json({ auth: req.auth });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
