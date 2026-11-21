// make.fun's dashboard-dossier library for Node 22: one file, the Node standard library only, erasable
// TypeScript, so it runs as-is under `node main.ts` with no flags, no build and no install. Copy it to
// vendor/makefun-board.ts in your repository (a copy anywhere else counts as lines you wrote) and import it:
//
//   import { buildDossier } from './vendor/makefun-board.ts';
//   writeFileSync('/output/dossier.json', buildDossier('/output', { text_max_bytes: 65536 }));
//
// The bounty's scorer runs this same file, byte for byte, on what you hand in, and requires your
// dossier.json to equal what buildDossier writes from your dashboard/ and screenshots/.
//
//   buildDossier(dir, caps)  the dossier (makefun/dossier/v1) of a dashboard directory, as canonical
//                            JSON bytes: the screenshots plus a text of the page's source
//
// A dossier is one JSON object (contracts/dossier.ts):
//
//   schema   "makefun/dossier/v1"
//   cover    0: the first screenshot by name is the cover
//   images   the PNG and JPEG files in dir/screenshots/ (names starting with '.' skipped), in name
//            order, each {name, media_type, sha256, base64}
//   text     what the judge reads: a "## Dashboard" block (the file count, the bytes, and every file's
//            path with its size), then "## Source", each text file's path, size and line count and its
//            contents in a fenced block by path, every file by path
//
// The text holds at most caps.text_max_bytes UTF-8 bytes: every file that fits goes in whole, in path
// order; the first that does not goes in up to its last complete line that fits (its fence closed, then
// a line naming how many of its lines are not shown), or not at all when not one line fits; nothing
// follows it but a last line naming how many whole files and how many bytes were left out. A file whose
// extension is not one of .html .css .js .json .mjs .svg .md .txt is named in the Dashboard block and
// not shown: the text is source, and the page's images are not source.
//
// buildDossier refuses (DossierError) an empty screenshots/ directory, a screenshot name a dossier
// refuses, a screenshot that is not a whole PNG or JPEG, a screenshot past its byte cap or more
// screenshots than the count cap, a dashboard file that is not plain (a link, a dot-directory, a name
// that is not letters, digits and . _ -, a file past its byte cap or more files than the count cap),
// a text cap that cannot hold the Dashboard block and the cut line, and a dossier past DOSSIER_MAX_BYTES.
// The caps only refuse: they never shape the bytes. Only text_max_bytes shapes them, so a program that
// passes {text_max_bytes} and writes the result has written what the scorer, given its other caps too,
// compares byte for byte.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join } from 'node:path';

/** The dossier schema buildDossier writes (contracts/dossier.ts DOSSIER_SCHEMA). */
export const DOSSIER_SCHEMA = 'makefun/dossier/v1';
/** The most bytes a dossier holds (contracts/dossier.ts DOSSIER_MAX_BYTES): 4 MiB. */
export const DOSSIER_MAX_BYTES = 4 * 1024 * 1024;
/** The most images a dossier holds (contracts/dossier.ts DOSSIER_MAX_IMAGES). */
export const DOSSIER_MAX_IMAGES = 8;
/** A plain file's name (contracts/dossier.ts DossierImageName): a letter, digit or _ first, then letters, digits and . _ -, 1 to 128 of them, no directory. */
export const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
/** A dashboard file whose contents the dossier's text shows: source, never an image. */
export const TEXT_FILE = /\.(?:html|css|js|json|mjs|svg|md|txt)$/;

/** What buildDossier is held to: the text's cap in UTF-8 bytes, and, when given, the screenshot and dashboard caps, which only refuse. */
export interface DossierCaps {
  text_max_bytes: number;
  screenshots?: { max: number; max_bytes: number };
  dashboard?: { max_files: number; max_bytes: number };
}

/** Why buildDossier writes no dossier for a directory: its caps, its screenshots, its dashboard or its size. */
export class DossierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DossierError';
  }
}

// ---------------------------------------------------------------- bytes

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

const opensWith = (bytes: Uint8Array, magic: readonly number[]): boolean => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

/**
 * A regular file's bytes when it is at most `cap` long; never through a link, never more than `cap`
 * bytes. Throws DossierError if the path is a symlink, not a regular file, or exceeds `cap`.
 */
function readCapped(path: string, cap: number, label: string): Uint8Array {
  const st = lstatSync(path);
  if (!st.isFile()) throw new DossierError(`${label}: not a regular file`);
  if (st.size > cap) throw new DossierError(`${label}: ${st.size} bytes exceeds cap of ${cap}`);
  const fd = openSync(path, constants.O_RDONLY);
  const buf = Buffer.alloc(st.size);
  readSync(fd, buf, 0, st.size, 0);
  closeSync(fd);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Counts the number of lines (LF-terminated) in a byte array.
 */
function lineCount(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) count++;
  return count;
}

/**
 * Determines a suitable fence for a code block: backticks or tildes, 3 or more, not appearing in the text.
 */
function fenceFor(text: string): string {
  let ticks = 3;
  while (text.includes('`'.repeat(ticks))) ticks++;
  let tildes = 3;
  while (text.includes('~'.repeat(tildes))) tildes++;
  return ticks <= tildes ? '`'.repeat(ticks) : '~'.repeat(tildes);
}

/**
 * Determines the language tag for a fenced code block based on file extension.
 */
function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'mjs') return 'js';
  return ext ?? '';
}

/**
 * Produces canonical JSON: keys sorted, no whitespace, UTF-8.
 */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(byCodeUnit);
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Reads a PNG or JPEG image file, validates it, returns {name, media_type, sha256, base64}.
 */
function readImage(path: string, label: string): { name: string; media_type: string; sha256: string; base64: string } {
  const bytes = readCapped(path, DOSSIER_MAX_BYTES, label);
  if (opensWith(bytes, PNG_MAGIC)) {
    return { name: label, media_type: 'image/png', sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  }
  if (opensWith(bytes, JPEG_MAGIC)) {
    return { name: label, media_type: 'image/jpeg', sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
  }
  throw new DossierError(`${label}: not a valid PNG or JPEG`);
}

/**
 * Scans a directory for regular files, validates names, returns sorted array of {path, size}.
 */
function scanDirectory(dir: string, label: string, maxFiles: number, maxBytes: number): { path: string; size: number }[] {
  if (!lstatSync(dir).isDirectory()) throw new DossierError(`${label}: not a directory`);
  const entries = readdirSync(dir);
  const files = entries
    .filter(name => !name.startsWith('.'))
    .map(name => ({ path: name, full: join(dir, name) }))
    .filter(({ full }) => lstatSync(full).isFile())
    .map(({ path, full }) => ({ path, size: fstatSync(openSync(full, constants.O_RDONLY)).size }));
  if (files.length > maxFiles) throw new DossierError(`${label}: ${files.length} files exceeds cap of ${maxFiles}`);
  files.sort((a, b) => byCodeUnit(a.path, b.path));
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > maxBytes) throw new DossierError(`${label}: ${total} bytes exceeds cap of ${maxBytes}`);
  return files;
}

/**
 * Builds the dossier for a dashboard directory.
 */
export function buildDossier(dir: string, caps: DossierCaps): Uint8Array {
  const { text_max_bytes: max, screenshots, dashboard } = caps;
  const shotDir = join(dir, 'screenshots');
  const dashDir = join(dir, 'dashboard');

  // --- Screenshots ---
  if (!screenshots) throw new DossierError('buildDossier: caps.screenshots is required');
  const shotEntries = scanDirectory(shotDir, 'screenshots', screenshots.max, screenshots.max_bytes);
  if (shotEntries.length === 0) throw new DossierError('buildDossier: screenshots/ is empty');
  const images = shotEntries.map(e => readImage(join(shotDir, e.path), `screenshots/${e.path}`));

  // --- Dashboard ---
  if (!dashboard) throw new DossierError('buildDossier: caps.dashboard is required');
  const dashFiles = scanDirectory(dashDir, 'dashboard', dashboard.max_files, dashboard.max_bytes);
  const textFiles = dashFiles.filter(f => TEXT_FILE.test(f.path));

  // --- Dashboard block (header) ---
  const dashSummary = dashFiles.map(f => `${f.path}  ${f.size} bytes`).join('\n');
  const head = `## Dashboard\n\n${dashFiles.length} files, ${dashFiles.reduce((s, f) => s + f.size, 0)} bytes\n\n${dashSummary}\n\n`;

  // --- Source block: each text file with heading and fenced code ---
  const shown = textFiles.map(f => {
    const bytes = readCapped(join(dashDir, f.path), DOSSIER_MAX_BYTES, `dashboard/${f.path}`);
    const lines = lineCount(bytes);
    const heading = `### ${f.path}\n\n${bytes.length} bytes, ${lines} line${lines === 1 ? '' : 's'}\n\n`;
    if (bytes.length === 0) return { heading, code: null, size: byteLength(heading), bytes: 0 };
    const text = new TextDecoder('utf-8').decode(bytes);
    const fence = fenceFor(text);
    const lang = languageOf(f.path);
    const block = `${fence}${lang}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
    return { heading, code: { bytes, text, fence, lang, block, blockBytes: byteLength(block), lines }, size: byteLength(heading) + byteLength(block), bytes: bytes.length };
  });

  // restBytes[k]: the bytes of the shown files after section k.
  const restBytes = new Array<number>(shown.length + 1).fill(0);
  for (let k = shown.length - 1; k >= 0; k--) restBytes[k] = restBytes[k + 1]! + (k + 1 < shown.length ? shown[k + 1]!.bytes : 0);

  const cutLine = (count: number, bytes: number): string => `[Cut at ${max} bytes: ${count} file${count === 1 ? '' : 's'} and ${bytes} bytes left out.]\n`;
  let out = head;
  let used = byteLength(head);
  if (used + byteLength(cutLine(0, 0)) > max) throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Dashboard block and the cut line`);
  let kept = 0;
  for (; kept < shown.length; kept++) {
    const section = shown[kept]!;
    const restCount = shown.length - kept - 1;
    const tail = restCount === 0 ? 0 : byteLength(cutLine(restCount, restBytes[kept]!));
    if (used + section.size + tail > max) break;
    out += section.code === null ? section.heading : `${section.heading}${section.code.block}`;
    used += section.size;
  }
  if (kept < shown.length) {
    // The first file that does not fit whole: its head, up to its last complete line that fits, then nothing more.
    const first = shown[kept]!;
    const restCount = shown.length - kept - 1;
    const after = restBytes[kept]!;
    const part = first.code === null ? null : fileHead(first.heading, first.code, max - used, (hidden) => cutLine(restCount, after + hidden));
    out += part ?? cutLine(restCount + 1, after + first.bytes);
  }
  if (byteLength(out) > max) throw new DossierError(`buildDossier: caps.text_max_bytes ${max} cannot hold even the Dashboard block and the cut line`);

  const doc = { schema: DOSSIER_SCHEMA, cover: 0, text: out.replace(/\n+$/, '\n'), images };
  const bytes = Buffer.from(canonicalJson(doc), 'utf8');
  if (bytes.length > DOSSIER_MAX_BYTES) throw new DossierError(`buildDossier: the dossier is ${bytes.length} bytes, over the ${DOSSIER_MAX_BYTES} one holds`);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** A shown file as the dossier shows it. */
interface ShownFile {
  bytes: Uint8Array;
  text: string;
  fence: string;
  /** The language the fence opens with (the file's extension, mjs as js). */
  lang: string;
  /** The fenced block: the fence and the language, the text (a last LF added when it lacks one), the fence, a blank line. */
  block: string;
  blockBytes: number;
  lines: number;
}

/**
 * A file's section cut inside its contents: its heading, its first k lines in its fence (closed), a line
 * naming how many of its lines are not shown, then `tail(hidden)` (the cut line, given the bytes this
 * file leaves out), k the most lines (at least one, fewer than all) whose whole fits in `room` UTF-8
 * bytes; null when not one line fits. It cuts only after a line's LF, which is never inside a UTF-8
 * sequence nor a replacement character's bytes, so no character is split, and a line's shown bytes are
 * those of its text.
 */
function fileHead(heading: string, code: ShownFile, room: number, tail: (hidden: number) => string): string | null {
  const total = code.lines;
  const lines = code.text.split('\n');
  const open = `${code.fence}${code.lang}\n`;
  const close = `${code.fence}\n\n`;
  const note = (k: number): string => `[${total - k} of this file's ${total} lines not shown.]\n`;
  const fixed = byteLength(heading) + byteLength(open) + byteLength(close);
  let best = 0;
  let shown = 0;
  let raw = 0;
  for (let k = 1; k < total; k++) {
    shown += byteLength(lines[k - 1]!) + 1;
    raw = code.bytes.indexOf(0x0a, raw) + 1;
    if (fixed + shown + byteLength(note(k)) + byteLength(tail(code.bytes.length - raw)) <= room) best = k;
  }
  if (best === 0) return null;
  let rawEnd = 0;
  for (let k = 0; k < best; k++) rawEnd = code.bytes.indexOf(0x0a, rawEnd) + 1;
  const head = lines.slice(0, best).map((l) => `${l}\n`).join('');
  return `${heading}${open}${head}${close}${note(best)}${tail(code.bytes.length - rawEnd)}`;
}
