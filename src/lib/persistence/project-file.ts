import { generateProject, parseDocument, type ParsedDocument, type Project } from '../project';
import { stableJSON } from '../project/metadata';

export const PROJECT_FORMAT = 'loopsmith-project';
export const STORAGE_KEY = 'loopsmith.project.v1';
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CODE_LENGTH = 1_000_000;
export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: 1;
  name: string;
  /** Current draft, which may contain incomplete/invalid JavaScript. */
  code: string;
  lastGoodCode: string;
  /** Identity anchor and cache. Revalidated against lastGoodCode on read. */
  project: Project;
}
export interface RestoredProject { file: ProjectFile; document: ParsedDocument }

export function projectFile(name: string, code: string, document: ParsedDocument): ProjectFile {
  if (code.length > MAX_CODE_LENGTH || document.code.length > MAX_CODE_LENGTH) throw new Error('Projects support up to 1,000,000 characters per source version. Download your code to keep a copy.');
  if (name.length > 160) throw new Error('Project names support up to 160 characters');
  return { format: PROJECT_FORMAT, version: 1, name, code, lastGoodCode: document.code, project: document.project };
}
export function serializeProject(file: ProjectFile, pretty = true): string {
  const text = JSON.stringify(file, null, pretty ? 2 : undefined);
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('Project JSON is larger than the 8 MiB file limit. Download plain code instead.');
  return text;
}
export function readProjectFile(text: string): RestoredProject {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('Project file exceeds the 8 MiB limit');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Choose a Loopsmith project JSON file.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a Loopsmith project object');
  const data = value as Record<string, unknown>;
  if (data.format !== PROJECT_FORMAT) throw new Error('This file is not a Loopsmith project');
  if (data.version !== 1) throw new Error(`Unsupported project version: ${String(data.version)}. This app reads version 1.`);
  if (typeof data.name !== 'string' || data.name.length > 160 || typeof data.code !== 'string' || typeof data.lastGoodCode !== 'string' || !data.project) throw new Error('Project is missing a valid name, draft, last-good code, or model');
  if (data.code.length > MAX_CODE_LENGTH || data.lastGoodCode.length > MAX_CODE_LENGTH) throw new Error('Project source exceeds the 1,000,000 character limit');
  try {
    // Only the temporary identity anchor is generated. Original editor/source bytes are authoritative.
    const anchor = parseDocument(generateProject(data.project as Project));
    if (!anchor.ok) throw new Error('Invalid identity anchor');
    const parsed = parseDocument(data.lastGoodCode, anchor.document);
    if (!parsed.ok) throw new Error(`Last-good code has a syntax error at line ${parsed.error.line}`);
    if (stableJSON(parsed.document.project) !== stableJSON(data.project)) throw new Error('Saved model does not match the last-good source');
    const file = projectFile(data.name, data.code, parsed.document);
    // If the draft is valid, its model is derived with the saved identity anchor, never trusted as code.
    return { file, document: parsed.document };
  } catch (cause) {
    throw new Error(`Project validation failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeFilename(name: string): string { return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'loopsmith-project'; }
