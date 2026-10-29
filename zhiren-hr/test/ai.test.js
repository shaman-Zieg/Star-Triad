import test from 'node:test';
import assert from 'node:assert/strict';
import { streamTask, validateTask } from '../server/ai.js';
import { buildPrompt, TASK_NAMES } from '../server/prompts.js';

function fakeResponse() {
  const chunks = [];
  return {
    chunks,
    writableEnded: false,
    destroyed: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(s) { chunks.push(s); },
    end() { this.writableEnded = true; },
    on() {},
    events() { return chunks.join('').trim().split('\n').map((l) => JSON.parse(l)); },
  };
}

function fakeClient(events, final) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
            finalMessage: async () => final,
            abort() {},
          };
        },
      },
    },
  };
}

test('every task builds a prompt with the requested language', () => {
  for (const task of TASK_NAMES) {
    const zh = buildPrompt(task, { question: 'q', articles: [] }, 'zh');
    const en = buildPrompt(task, { question: 'q', articles: [] }, 'en');
    assert.match(zh.system, /Simplified Chinese/);
    assert.match(en.system, /in English/);
    assert.ok(['low', 'medium', 'high'].includes(zh.effort));
  }
  assert.equal(buildPrompt('nope', {}, 'zh'), null);
  assert.match(validateTask('resume', { resume: 'x'.repeat(70_000), position: {}, analysis: {} }, 'zh').error, /too long/);
});

test('streams text as NDJSON, resets after a fallback switch, and requests the configured model', async () => {
  const client = fakeClient([
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } },
    { type: 'content_block_start', content_block: { type: 'fallback' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
  ], { stop_reason: 'end_turn', model: 'claude-opus-5-5' });
  const res = fakeResponse();
  await streamTask(buildPrompt('jd', { title: 'PM' }, 'en'), res, {}, client);
  const ev = res.events();
  assert.deepEqual(ev.map((e) => e.t), ['text', 'reset', 'text', 'text', 'done']);
  assert.equal(ev.filter((e) => e.t === 'text').slice(1).map((e) => e.v).join(''), 'Hello world');
  assert.equal(res.headers['Content-Type'], 'application/x-ndjson; charset=utf-8');
  const params = client.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.output_config.effort, 'medium');
  assert.equal(params.thinking, undefined, 'Opus 5.5 rejects explicit disabled thinking; leave it unset');
  assert.ok(res.writableEnded);
});

test('reports refusals and API errors as events instead of crashing', async () => {
  const refused = fakeResponse();
  await streamTask(buildPrompt('assistant', { question: 'q', articles: [] }, 'zh'), refused, {}, fakeClient([], { stop_reason: 'refusal', model: 'm' }));
  assert.deepEqual(refused.events().map((e) => e.t), ['note', 'done']);
  const broken = fakeResponse();
  const client = { beta: { messages: { stream() { throw new Error('boom'); } } } };
  await streamTask(buildPrompt('idp', {}, 'zh'), broken, {}, client);
  assert.equal(broken.events()[0].t, 'error');
  assert.ok(broken.writableEnded);
});
