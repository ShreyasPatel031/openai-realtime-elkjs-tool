#!/usr/bin/env node

/**
 * Mock Test Server
 * ---------------
 * Serves the built client (`dist/`) and exposes deterministic mock API endpoints
 * so the local test suite can run without external dependencies (OpenAI, dev server).
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

const PORT = Number(process.env.PORT || 3000);

if (!fs.existsSync(distDir)) {
  console.error('❌ mock-test-server: Unable to find dist/ directory. Make sure to run `npm run test:build` first.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

const deterministicEmbedding = (text, length = 128) => {
  const vector = new Array(length).fill(0);
  let seed = 0;

  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    const index = seed % length;
    const value = ((seed % 2000) / 1000) - 1; // range [-1, 1)
    vector[index] = Number(value.toFixed(6));
  }

  if (vector.every((val) => val === 0)) {
    return vector.map((_, idx) => Number(Math.sin(idx + seed).toFixed(6)));
  }

  return vector;
};

const sendStaticFile = (res, filePath) => {
  res.sendFile(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res
          .status(404)
          .type('text/html')
          .send('<!doctype html><html><body>Not Found</body></html>');
      } else {
        res.status(500).json({ error: 'Failed to serve file', details: err.message });
      }
    }
  });
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', source: 'mock-test-server' });
});

app.get('/precomputed-icon-embeddings.json', (_req, res) => {
  const candidates = [
    path.join(distDir, 'precomputed-icon-embeddings.json'),
    path.join(distDir, 'embeddable', 'precomputed-icon-embeddings.json'),
    path.join(rootDir, 'public', 'precomputed-icon-embeddings.json'),
  ];

  const embeddingPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!embeddingPath) {
    return res.status(404).json({ error: 'Embeddings file not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.sendFile(embeddingPath);
});

app.get('/icons/*', (req, res) => {
  const relativePath = req.params[0] || '';
  const filePath = path.join(distDir, 'icons', relativePath);
  sendStaticFile(res, filePath);
});

app.get('/group-icons/*', (req, res) => {
  const relativePath = req.params[0] || '';
  const filePath = path.join(distDir, 'group-icons', relativePath);
  sendStaticFile(res, filePath);
});

app.get('/assets/*', (req, res) => {
  const relativePath = req.params[0] || '';
  const filePath = path.join(distDir, 'assets', relativePath);
  sendStaticFile(res, filePath);
});

app.post('/api/embed', (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text parameter' });
  }
  const embedding = deterministicEmbedding(text);
  res.json({ embedding });
});

app.post('/api/simple-agent', (req, res) => {
  const { message = '' } = req.body ?? {};

  const baseId = message
    ? message.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'architecture'
    : 'architecture';

  const operations = [
    {
      name: 'add_node',
      nodename: `${baseId}-entry`,
      parentId: 'root',
      data: { label: 'Client', icon: 'browser_client' },
    },
    {
      name: 'add_node',
      nodename: `${baseId}-trace`,
      parentId: 'root',
      data: { label: 'GCP Cloud Trace', icon: 'gcp_cloud_trace' },
    },
    {
      name: 'add_edge',
      edgeId: `${baseId}-edge`,
      sourceId: `${baseId}-entry`,
      targetId: `${baseId}-trace`,
      label: 'sends trace data to',
    },
  ];

  res.json({
    success: true,
    functionCalls: [
      {
        name: 'batch_update',
        arguments: { operations },
        call_id: `mock-call-${Date.now()}`,
      },
    ],
    count: 1,
    turnNumber: 1,
    isLikelyFinalTurn: true,
    continueMessage: 'Architecture complete',
    responseId: `mock_response_${Date.now()}`,
    hasMoreWork: operations.length > 0,
  });
});

app.post('/api/generateChatName', (req, res) => {
  const { userPrompt = '', nodeCount = 0, edgeCount = 0 } = req.body ?? {};
  const trimmed = String(userPrompt).trim();
  const summary = trimmed ? trimmed.split('\n')[0].slice(0, 48) : 'Generated Architecture';
  const suffix = `${nodeCount}n${edgeCount}e`;
  res.json({
    success: true,
    name: `${summary || 'Architecture Draft'} (${suffix})`,
  });
});

app.post('/api/chat', (_req, res) => {
  res.json({
    output: [
      {
        type: 'message',
        content: 'This is a mocked chat response for local tests.',
      },
    ],
    output_text: 'This is a mocked chat response for local tests.',
  });
});

app.post('/api/stream', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: 'status', message: 'mock stream started' });
  send({
    type: 'event',
    name: 'batch_update',
    data: {
      operations: [
        {
          name: 'add_node',
          nodename: 'mock-node',
          parentId: 'root',
          data: { label: 'Mock Node', icon: 'database' },
        },
      ],
    },
  });
  send({ type: 'done' });
  res.end();
});

app.use(express.static(distDir, { extensions: ['html'] }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🧪 Mock test server running at http://localhost:${PORT}`);
});

const shutdown = () => {
  console.log('\n🛑 Shutting down mock test server...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
