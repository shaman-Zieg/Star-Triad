import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { DOCX_LIMITS, readDocumentXml, wordDocumentText, readDocx } from '../public/js/engine/docx.js';

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${NS}"><w:body><w:p><w:r><w:t>张三</w:t><w:tab/><w:t>Java 工程师</w:t><w:br/><w:t>三年经验 &amp; 项目管理</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>技能</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>JavaScript</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;

// Small ZIP fixture writer, with zlib's independent CRC and DEFLATE implementations.
function zip(entries = [{ name: 'word/document.xml', data: xml }], { comment = '' } = {}) {
  const locals = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '');
    const name = Buffer.from(entry.name), extra = entry.extra || Buffer.alloc(0);
    const method = entry.method ?? 8, flags = entry.flags ?? (entry.descriptor ? 8 : 0);
    const packed = method === 0 ? data : deflateRawSync(data);
    const checksum = crc32(data), declared = entry.declared ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!(flags & 8)) { local.writeUInt32LE(checksum, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(declared, 22); }
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra.length, 28);
    const descriptor = entry.descriptor ? Buffer.alloc(entry.descriptor === 'signed' ? 16 : 12) : Buffer.alloc(0);
    if (descriptor.length) {
      const i = descriptor.length - 12;
      if (i) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(checksum, i); descriptor.writeUInt32LE(packed.length, i + 4); descriptor.writeUInt32LE(declared, i + 8);
    }
    locals.push(local, name, extra, packed, descriptor);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
    header.writeUInt16LE(flags, 8); header.writeUInt16LE(method, 10); header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(packed.length, 20); header.writeUInt32LE(declared, 24);
    header.writeUInt16LE(name.length, 28); header.writeUInt16LE(extra.length, 30); header.writeUInt32LE(offset, 42);
    central.push(header, name, extra);
    offset += local.length + name.length + extra.length + packed.length + descriptor.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), commentBytes = Buffer.from(comment);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(commentBytes.length, 20);
  return Buffer.concat([...locals, directory, end, commentBytes]);
}
const documentZip = options => zip([{ name: 'word/document.xml', data: xml, ...options }]);
const directoryAt = buffer => buffer.readUInt32LE(buffer.length - 6);

test('stored and raw-DEFLATE Word XML round-trip Chinese paragraphs, tables and entities', async () => {
  for (const method of [0, 8]) {
    const archive = documentZip({ method });
    assert.equal(await readDocumentXml(archive), xml);
    assert.equal(await readDocumentXml(new Blob([archive])), xml);
    const padded = Buffer.concat([Buffer.alloc(10), archive, Buffer.alloc(10)]);
    assert.equal(await readDocumentXml(padded.subarray(10, -10)), xml, 'honors typed-array byte offsets');
  }
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml.replace('UTF-8', 'UTF-16'), 'utf16le')]);
  assert.equal(await readDocumentXml(documentZip({ data: utf16 })), xml.replace('UTF-8', 'UTF-16'));
});

test('accepts signed/unsigned data descriptors and an ordinary ZIP comment', async () => {
  for (const descriptor of ['signed', 'unsigned']) assert.equal(await readDocumentXml(documentZip({ descriptor })), xml);
  assert.equal(await readDocumentXml(zip([{ name: 'word/document.xml', data: xml }], { comment: 'A resume' })), xml);
  const damaged = documentZip({ descriptor: 'signed' });
  damaged[directoryAt(damaged) - 1] ^= 1;
  await assert.rejects(readDocumentXml(damaged), /descriptor/);
});

test('rejects corrupt checksums, local sizes, filenames, offsets, truncated files and DEFLATE data', async () => {
  const wrongCrc = documentZip({ method: 0 });
  wrongCrc[30 + Buffer.byteLength('word/document.xml') + 10] ^= 1;
  await assert.rejects(readDocumentXml(wrongCrc), /CRC checksum/);
  const size = documentZip(); size.writeUInt32LE(1, 22);
  await assert.rejects(readDocumentXml(size), /local sizes/);
  const name = documentZip(); name[30] = 0x78;
  await assert.rejects(readDocumentXml(name), /filename/);
  const offset = documentZip(); offset.writeUInt32LE(offset.length + 1, directoryAt(offset) + 42);
  await assert.rejects(readDocumentXml(offset), /offset/);
  const deflate = documentZip(); deflate.fill(0xff, 47, directoryAt(deflate));
  await assert.rejects(readDocumentXml(deflate), /DEFLATE/);
  await assert.rejects(readDocumentXml(documentZip().subarray(0, -1)), /directory/);
  await assert.rejects(readDocumentXml(Buffer.from('not a word file')), /valid Word/);
});

test('rejects encryption, unsupported methods, ZIP64, duplicates and missing document.xml', async () => {
  await assert.rejects(readDocumentXml(documentZip({ flags: 1 })), /Encrypted/);
  await assert.rejects(readDocumentXml(documentZip({ method: 9 })), /compression/);
  await assert.rejects(readDocumentXml(documentZip({ extra: Buffer.from([1, 0, 0, 0]) })), /ZIP64/);
  const zip64 = documentZip(); zip64.writeUInt32LE(0xffffffff, directoryAt(zip64) + 24);
  await assert.rejects(readDocumentXml(zip64), /ZIP64/);
  await assert.rejects(readDocumentXml(zip([{ name: 'word/document.xml', data: xml }, { name: 'word/document.xml', data: xml }])), /duplicate/);
  await assert.rejects(readDocumentXml(zip([{ name: 'word/styles.xml', data: xml }])), /document.xml is missing/);
  await assert.rejects(readDocumentXml(zip([{ name: '../document.xml', data: xml }])), /entry name/);
});

test('bounds file size, entry count, declared expansion and actual streamed expansion', async () => {
  await assert.rejects(readDocumentXml(new Blob([new Uint8Array(DOCX_LIMITS.fileBytes + 1)])), /10 MB/);
  await assert.rejects(readDocumentXml(zip(Array.from({ length: DOCX_LIMITS.entries + 1 }, (_, i) => ({ name: `x${i}`, data: '' })))), /too many/);
  await assert.rejects(readDocumentXml(documentZip({ declared: DOCX_LIMITS.xmlBytes + 1 })), /2 MB/);
  await assert.rejects(readDocumentXml(zip([{ name: 'word/document.xml', data: xml }, { name: 'word/media/image.png', data: '', declared: DOCX_LIMITS.totalBytes }])), /50 MB/);
  await assert.rejects(readDocumentXml(documentZip({ data: 'x'.repeat(DOCX_LIMITS.xmlBytes + 100), declared: 100 })), /Expanded document/);
});

test('rejects DTDs, entities and processing instructions before invoking any XML parser', async () => {
  for (const unsafe of ['<!DOCTYPE document SYSTEM "https://example.com/evil">', '<!ENTITY x "boom">', '<?xml-stylesheet href="https://example.com/style"?>']) {
    await assert.rejects(readDocumentXml(documentZip({ data: unsafe + xml })), /XML entities/);
  }
  await assert.rejects(readDocumentXml(documentZip({ data: Buffer.from([0xff, 0xff, 0xff]) })), /encoding/);
});

// Node has no DOMParser. Exercise the namespace-aware DOM traversal with small
// DOM-shaped nodes; browser smoke testing additionally covers real XML parsing.
function element(name, children = [], text = '', namespaceURI = NS) {
  for (let i = 0; i < children.length; i++) children[i].previousElementSibling = children[i - 1] || null;
  return { localName: name, namespaceURI, textContent: text, lastElementChild: children.at(-1) || null };
}
const t = text => element('t', [], text);
const p = (...children) => element('p', [element('r', children)]);
const dom = children => ({ documentElement: element('document', [element('body', children)]), getElementsByTagName: () => [] });

test('Word DOM traversal preserves paragraphs, tabs, line breaks and table cells as plain text', () => {
  const document = dom([
    p(t('张三'), element('tab'), t('Java 工程师'), element('br'), t('三年经验 & 项目管理')),
    element('tbl', [element('tr', [element('tc', [p(t('技能'))]), element('tc', [p(t('JavaScript'))])])]),
    p(element('hyperlink', [t('https://example.com')]), element('del', [t('deleted')]), element('instrText', [], 'HYPERLINK evil')),
  ]);
  assert.equal(wordDocumentText(document), '张三\tJava 工程师\n三年经验 & 项目管理\n技能\tJavaScript\nhttps://example.com');
  assert.equal(wordDocumentText(dom([p(t('<script>alert(1)</script>'))])), '<script>alert(1)</script>', 'returns text, never HTML');
});

test('rejects wrong XML roots, parser errors, image-only documents and excessive text', async () => {
  const wrong = dom([]); wrong.documentElement.namespaceURI = 'http://www.w3.org/1999/xhtml';
  assert.throws(() => wordDocumentText(wrong), /Malformed/);
  assert.throws(() => wordDocumentText({ ...dom([p(t('text'))]), getElementsByTagName: () => [{}] }), /Malformed/);
  assert.throws(() => wordDocumentText(dom([])), /No readable text/);
  assert.throws(() => wordDocumentText(dom([p(t('x'.repeat(DOCX_LIMITS.textChars + 1)))])), /200000/);
  if (typeof DOMParser === 'undefined') await assert.rejects(readDocx(documentZip()), /cannot parse Word XML/);
});

test('empty table cells, tab-stop definitions and text-box fallbacks do not distort the text', () => {
  const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const cell = (...children) => element('tc', children);
  const table = element('tbl', [element('tr', [cell(p(t('A'))), cell(p(t('B')))]), element('tr', [cell(element('p')), cell(p(t('C')))])]);
  assert.equal(wordDocumentText(dom([table])), 'A\tB\n\tC', 'a row starting with an empty cell stays on its own line');
  const tabStops = element('pPr', [element('tabs', [element('tab')])]);
  assert.equal(wordDocumentText(dom([p(t('A')), element('p', [tabStops, element('r', [t('B')])])])), 'A\nB', 'tab-stop definitions are not tabs');
  const box = () => element('txbxContent', [p(t('2019-2021 Acme'))]);
  const alternate = element('AlternateContent', [element('Choice', [box()], '', MC), element('Fallback', [box()], '', MC)], '', MC);
  assert.equal(wordDocumentText(dom([p(alternate)])), '2019-2021 Acme', 'a text box is read once');
});
