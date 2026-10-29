// Optional Claude assistance. The Anthropic SDK is an optional dependency: without
// it (or without credentials) the app runs fully on its rule engines and the AI
// buttons explain how to turn this on.
import { AI_MODEL, AI_RATE_LIMIT } from './config.js';
import { buildPrompt, MAX_INPUT_CHARS } from './prompts.js';

let Anthropic = null;
let client = null;
let reason = '';

export async function initAI() {
  if (process.env.ZHIREN_AI === '0') {
    reason = 'disabled';
    return;
  }
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    reason = 'no-sdk';
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
    reason = 'no-key';
    return;
  }
  try {
    client = new Anthropic();
  } catch {
    reason = 'init-failed';
  }
}

export const aiStatus = () => ({ enabled: Boolean(client), model: client ? AI_MODEL : null, reason: client ? '' : reason });

// Simple sliding-window limiter shared by all callers.
const recent = [];
export function aiRateLimited() {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= AI_RATE_LIMIT) return true;
  recent.push(now);
  return false;
}

export function validateTask(task, input, lang) {
  const built = buildPrompt(task, input, lang);
  if (!built) return { error: 'Unknown AI task' };
  if (built.prompt.length > MAX_INPUT_CHARS) return { error: 'Input is too long for one request. Shorten the text and try again.' };
  return { built };
}

function describeError(err) {
  if (!Anthropic) return 'AI request failed.';
  if (err instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to the configured model.';
  if (err instanceof Anthropic.NotFoundError) return `Model ${AI_MODEL} was not found. Check ZHIREN_AI_MODEL.`;
  if (err instanceof Anthropic.RateLimitError) return 'The AI service is rate limited right now. Try again in a minute.';
  if (err instanceof Anthropic.BadRequestError) return `The AI request was rejected: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check the network or proxy settings.';
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? 'unknown'}). Try again later.`;
  return 'AI request failed.';
}

// Streams the answer as NDJSON events: {t:"text",v}, {t:"reset"} (discard partial
// text after a server-side fallback), {t:"note",v}, {t:"error",v}, {t:"done"}.
export async function streamTask({ system, prompt, effort }, res, headers, api = client) {
  res.writeHead(200, { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  let stream;
  res.on('close', () => stream?.abort());
  try {
    stream = api.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 16000,
      // Re-run a declined request on Anthropic's recommended fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'fallback') send({ t: 'reset' });
      else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send({ t: 'text', v: event.delta.text });
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') send({ t: 'note', v: 'refusal' });
    else if (final.stop_reason === 'max_tokens') send({ t: 'note', v: 'truncated' });
    send({ t: 'done', model: final.model });
  } catch (err) {
    if (!res.writableEnded && !res.destroyed) send({ t: 'error', v: describeError(err) });
    if (!(Anthropic && err instanceof Anthropic.APIUserAbortError)) console.error('[ai]', err?.message || err);
  } finally {
    if (!res.writableEnded) res.end();
  }
}
