// DOCX main-document text only, using browser built-ins. No relationships,
// images, macros, external resources or XML nodes are loaded into the page.
// ZIP layout: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
// Raw DEFLATE: https://compression.spec.whatwg.org/
export const DOCX_LIMITS = Object.freeze({ fileBytes: 10 * 1024 * 1024, entries: 512, xmlBytes: 2 * 1024 * 1024, totalBytes: 50 * 1024 * 1024, textChars: 200000 });
const WORD_NS = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const COMPATIBILITY_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const fail = message => { throw new Error(`DOCX: ${message}`); };
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

async function bytesOf(input) {
  if (input instanceof Blob) {
    if (input.size > DOCX_LIMITS.fileBytes) fail('File exceeds 10 MB.');
    input = await input.arrayBuffer();
  }
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input instanceof Uint8Array ? input : null;
  if (!bytes || bytes.length < 22) fail('Not a valid Word .docx file.');
  if (bytes.length > DOCX_LIMITS.fileBytes) fail('File exceeds 10 MB.');
  return bytes;
}

function documentEntry(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const range = (at, size, end = bytes.length) => { if (!Number.isSafeInteger(at) || at < 0 || at + size > end) fail('Truncated or invalid ZIP offsets.'); };
  const u16 = at => { range(at, 2); return view.getUint16(at, true); };
  const u32 = at => { range(at, 4); return view.getUint32(at, true); };
  if (u32(0) !== 0x04034b50) fail('Not a Word .docx ZIP file; encrypted or old .doc files are unsupported.');
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail('ZIP directory is missing or truncated.');
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff || (end >= 20 && u32(end - 20) === 0x07064b50)) fail('ZIP64 files are unsupported.');
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count) fail('Multi-volume ZIP files are unsupported.');
  if (!count || count > DOCX_LIMITS.entries) fail('ZIP has too many entries (maximum 512).');
  if (start + size !== end) fail('Invalid ZIP directory size.');
  const extras = (at, length) => {
    const stop = at + length;
    range(at, length);
    while (at < stop) {
      range(at, 4, stop);
      const key = u16(at), n = u16(at + 2);
      if (key === 1) fail('ZIP64 files are unsupported.');
      if (key === 0x9901) fail('Encrypted files are unsupported.');
      range(at + 4, n, stop); at += 4 + n;
    }
  };
  const names = new Set(), spans = [];
  let cursor = start, total = 0, selected;
  for (let i = 0; i < count; i++) {
    range(cursor, 46, end);
    if (u32(cursor) !== 0x02014b50) fail('Invalid ZIP directory entry.');
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16);
    const compressed = u32(cursor + 20), unpacked = u32(cursor + 24), offset = u32(cursor + 42);
    const nameSize = u16(cursor + 28), extraSize = u16(cursor + 30), commentSize = u16(cursor + 32);
    if ([compressed, unpacked, offset].includes(0xffffffff) || u16(cursor + 34) === 0xffff) fail('ZIP64 files are unsupported.');
    if (u16(cursor + 34)) fail('Multi-volume ZIP files are unsupported.');
    if (flags & 0x2041) fail('Encrypted files are unsupported.');
    if (flags & ~0x080e || ![0, 8].includes(method)) fail('Unsupported ZIP compression or flags.');
    range(cursor + 46, nameSize + extraSize + commentSize, end);
    let name;
    try { name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'windows-1252', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize)); }
    catch { fail('Invalid ZIP entry name.'); }
    if (!name || /[\\\0]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) fail('Invalid or duplicate ZIP entry name.');
    names.add(name); extras(cursor + 46 + nameSize, extraSize);
    total += unpacked;
    if (total > DOCX_LIMITS.totalBytes) fail('Expanded archive exceeds 50 MB.');
    if (method === 0 && compressed !== unpacked) fail('Stored ZIP entry has inconsistent sizes.');
    range(offset, 30, start);
    if (u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method) fail('ZIP local header does not match its directory.');
    const localNameSize = u16(offset + 26), localExtraSize = u16(offset + 28), dataStart = offset + 30 + localNameSize + localExtraSize;
    range(offset + 30, localNameSize + localExtraSize, start);
    if (localNameSize !== nameSize || !bytes.subarray(offset + 30, offset + 30 + localNameSize).every((b, n) => b === bytes[cursor + 46 + n])) fail('ZIP local filename does not match its directory.');
    extras(offset + 30 + localNameSize, localExtraSize);
    for (const [at, expected] of [[14, crc], [18, compressed], [22, unpacked]]) {
      const actual = u32(offset + at);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) fail('ZIP local sizes or checksum do not match its directory.');
    }
    range(dataStart, compressed, start);
    let dataEnd = dataStart + compressed;
    if (flags & 8) {
      range(dataEnd, 12, start);
      const matches = at => at + 12 <= start && u32(at) === crc && u32(at + 4) === compressed && u32(at + 8) === unpacked;
      if (matches(dataEnd)) dataEnd += 12;
      else if (u32(dataEnd) === 0x08074b50 && matches(dataEnd + 4)) dataEnd += 16;
      else fail('Invalid ZIP data descriptor.');
    }
    spans.push([offset, dataEnd]);
    if (name === 'word/document.xml') {
      if (unpacked > DOCX_LIMITS.xmlBytes) fail('Document XML exceeds 2 MB.');
      selected = { method, crc, unpacked, bytes: bytes.subarray(dataStart, dataStart + compressed) };
    }
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  if (cursor !== end) fail('ZIP directory entry count does not match its size.');
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) fail('ZIP entries overlap.');
  if (!selected) fail('word/document.xml is missing. Choose a Word .docx file.');
  return selected;
}

async function unpack(entry) {
  let bytes = entry.bytes;
  if (entry.method === 8) {
    let stream;
    try { stream = new DecompressionStream('deflate-raw'); }
    catch { fail('This browser cannot decompress Word files. Update the browser or paste the resume text.'); }
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > DOCX_LIMITS.xmlBytes || size > entry.unpacked) {
          await reader.cancel(); fail('Expanded document exceeds its declared size or the 2 MB limit.');
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error.message.startsWith('DOCX:')) throw error;
      fail('Damaged DEFLATE document data.');
    } finally { reader.releaseLock(); }
    bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  }
  if (bytes.length !== entry.unpacked || crc32(bytes) !== entry.crc) fail('Document size or CRC checksum is invalid.');
  return bytes;
}

/** Exported separately so ZIP parsing can be tested on Node without a DOM. */
export async function readDocumentXml(input) {
  const bytes = await unpack(documentEntry(await bytesOf(input)));
  let encoding = 'utf-8';
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0)) encoding = 'utf-16le';
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c)) encoding = 'utf-16be';
  let xml;
  try { xml = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { fail('Document XML has invalid text encoding.'); }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || /<\?(?!xml\s)/i.test(xml)) fail('XML entities, DTDs and processing instructions are unsupported.');
  return xml;
}

/** Reads a detached Word XML DOM; never inserts or renders document nodes. */
export function wordDocumentText(document) {
  const root = document.documentElement;
  if (!root || root.localName !== 'document' || !WORD_NS.has(root.namespaceURI) || document.getElementsByTagName('parsererror').length) fail('Malformed Word document XML.');
  const output = [], stack = [[root, false, 0]];
  let length = 0;
  const add = text => {
    length += text.length;
    if (length > DOCX_LIMITS.textChars) fail('Resume text exceeds 200000 characters.');
    output.push(text);
  };
  // Only trims what this cell or row added, so an empty cell cannot swallow the previous row's line break.
  const trimEnd = (character, start) => {
    while (output.length > start && (output.at(-1) === character || !output.at(-1))) { length -= output.pop().length; }
  };
  while (stack.length) {
    const [node, closing, start] = stack.pop();
    const word = WORD_NS.has(node.namespaceURI), name = node.localName;
    if (closing) {
      if (word && name === 'p') add('\n');
      if (word && name === 'tc') { trimEnd('\n', start); add('\t'); }
      if (word && name === 'tr') { trimEnd('\t', start); add('\n'); }
      continue;
    }
    // A text box is stored twice, as drawing and legacy fallback; properties hold tab-stop definitions, not text.
    if (node.namespaceURI === COMPATIBILITY_NS && name === 'Fallback') continue;
    if (word && ['del', 'moveFrom', 'instrText', 'pPr', 'rPr'].includes(name)) continue;
    if (word && name === 't') { add(node.textContent || ''); continue; }
    if (word && ['tab', 'br', 'cr'].includes(name)) { add(name === 'tab' ? '\t' : '\n'); continue; }
    stack.push([node, true, output.length]);
    for (let child = node.lastElementChild; child; child = child.previousElementSibling) stack.push([child, false, 0]);
  }
  const text = output.join('').replace(/\r\n?/g, '\n').trim();
  if (!text) fail('No readable text found. Image-only resumes need text pasted manually.');
  return text;
}

export async function readDocx(input) {
  const xml = await readDocumentXml(input);
  if (typeof DOMParser !== 'function') fail('This browser cannot parse Word XML. Paste the resume text instead.');
  return wordDocumentText(new DOMParser().parseFromString(xml, 'application/xml'));
}
