import { parseDocument } from '../project';
import { projectFile, type RestoredProject } from './project-file';

export const MAX_SHARE_URL_LENGTH = 2_000_000;
export const MAX_SHARE_CODE_BYTES = 1_000_000;
/** Strudel code2hash: encodeURIComponent(Base64(UTF8(code))). Never fetches or evaluates. */
export function decodeShareUrl(input: string): string {
  if (input.length > MAX_SHARE_URL_LENGTH) throw new Error('Share URL exceeds the 2,000,000 character limit. Import project JSON instead.');
  const text = input.trim();
  if (!text || /\s/.test(text)) throw new Error('Paste one complete Strudel share URL without spaces or line breaks.');
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('Paste a complete https://strudel.cc/#… share URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'strudel.cc' || url.port || url.username || url.password || !['/','/embed','/embed/'].includes(url.pathname)) throw new Error('Use a https://strudel.cc/ or https://strudel.cc/embed/ share URL with code in its # fragment.');
  if (url.hash.length <= 1) throw new Error('This URL has no shared code after #. Copy the full Strudel share URL.');
  let base64: string;
  try { base64 = decodeURIComponent(url.hash.slice(1)); } catch { throw new Error('The share URL contains invalid percent encoding. Copy the complete link again.'); }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) throw new Error('The share URL does not contain supported Base64 code. Short links and other encodings are not supported.');
  if (base64.length > Math.ceil(MAX_SHARE_CODE_BYTES/3)*4) throw new Error('Shared code exceeds the 1,000,000 UTF-8 byte limit. Import project JSON instead.');
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error('The share URL contains incomplete or invalid Base64 code. Copy the complete link again.'); }
  if (binary.length > MAX_SHARE_CODE_BYTES) throw new Error('Shared code exceeds the 1,000,000 UTF-8 byte limit. Import project JSON instead.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  try { return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
  catch { throw new Error('Shared code is not valid UTF-8 text.'); }
}
export function readShareUrl(input: string): RestoredProject {
  const code = decodeShareUrl(input);
  const parsed = parseDocument(code);
  if (!parsed.ok) throw new Error(`Shared code has a syntax error: ${parsed.error.message}. Open it in Strudel to fix it before importing.`);
  return {file:projectFile('Imported Strudel loop',code,parsed.document),document:parsed.document};
}

/** Native source-only export, chunked so large projects do not overflow a function argument list. */
export function createShareUrl(code: string): string {
  if (!code.length) throw new Error('Add code before creating a share link.');
  if(!code.length) throw new Error('Add code before creating a share link.');
  if(code.length>MAX_SHARE_CODE_BYTES) throw new Error('Shared code exceeds the 1,000,000 UTF-8 byte limit. Export project JSON instead.');
  const bytes=new TextEncoder().encode(code);
  if(bytes.length>MAX_SHARE_CODE_BYTES) throw new Error('Shared code exceeds the 1,000,000 UTF-8 byte limit. Export project JSON instead.');
  if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==code) throw new Error('Source contains invalid Unicode text. Export project JSON to preserve it.');
  const parsed=parseDocument(code);
  if(!parsed.ok) throw new Error(`Fix syntax errors before creating a share link: ${parsed.error.message}. Download code to keep an unfinished draft.`);
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=32768) binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
  const url='https://strudel.cc/#'+encodeURIComponent(btoa(binary));
  if(url.length>MAX_SHARE_URL_LENGTH) throw new Error('The generated share URL exceeds the link-size limit. Export project JSON instead.');
  return url;
}
