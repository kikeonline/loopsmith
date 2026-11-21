import { describe, expect, it } from 'vitest';
import { decodeShareUrl, readShareUrl, MAX_SHARE_CODE_BYTES, MAX_SHARE_URL_LENGTH } from './share-url';
import { readProjectFile, serializeProject } from './project-file';
const link = (code:string) => `https://strudel.cc/#${encodeURIComponent(Buffer.from(code,'utf8').toString('base64'))}`;
describe('local Strudel share import', () => {
  it('decodes an independently authored Base64 vector', () => {
    expect(decodeShareUrl('https://strudel.cc/#cygiYmQiKQ%3D%3D')).toBe('s("bd")');
    expect(decodeShareUrl('https://strudel.cc/#cygiYmQiKQ')).toBe('s("bd")');
  });
  it('preserves UTF-8, BOM, mixed newlines, source comments and literal plus/slash bytes', () => {
    const code='\uFEFF// café 🌊\r\ndrums: s("bd ~").jux( rev );\n// ࠾࠿\r\n';
    expect(decodeShareUrl(`  ${link(code)}\n`)).toBe(code);
    const plusSlash='// ࠾࠿\ns("bd")';
    const base64=Buffer.from(plusSlash).toString('base64'); expect(base64).toContain('+'); expect(base64).toContain('/');
    expect(decodeShareUrl(`https://strudel.cc/#${base64}`)).toBe(plusSlash);
  });
  it('supports native embed links and ignores query parameters while decoding only the fragment once', () => {
    expect(decodeShareUrl(link('s("hh")').replace('/#','/embed/?theme=dark#'))).toBe('s("hh")');
    expect(() => decodeShareUrl('https://strudel.cc/#cygiYmQiKQ%253D%253D')).toThrow('Base64');
  });
  it('rejects missing code, malformed encodings, invalid UTF-8 and unsupported short links', () => {
    for(const url of ['https://strudel.cc/','https://strudel.cc/#','https://strudel.cc/?code=cygiYmQiKQ==','https://strudel.cc/#%XX','https://strudel.cc/#YQ=','https://strudel.cc/#a','https://strudel.cc/#not_base64','https://strudel.cc/#code=abc','https://strudel.cc/#/w==','https://strudel.cc/#aA==\nx']) expect(() => decodeShareUrl(url)).toThrow();
  });
  it('rejects arbitrary origins, executable schemes, credentials, ports and non-REPL paths', () => {
    for(const prefix of ['javascript:alert(1)//','http://strudel.cc/','https://strudel.cc.evil.test/','https://example.com/','https://user@strudel.cc/','https://strudel.cc:8443/','https://strudel.cc/workshop/','https://strudel.cc/s/short']) expect(() => decodeShareUrl(prefix+'#cygiYmQiKQ==')).toThrow();
  });
  it('bounds encoded input and decoded UTF-8 allocation at both size boundaries', () => {
    expect(() => decodeShareUrl('x'.repeat(MAX_SHARE_URL_LENGTH+1))).toThrow('2,000,000');
    const code='x'.repeat(MAX_SHARE_CODE_BYTES); expect(decodeShareUrl(link(code))).toBe(code);
    expect(() => decodeShareUrl(link(code+'x'))).toThrow('1,000,000');
    expect(() => decodeShareUrl(link('🌊'.repeat(250001)))).toThrow('1,000,000');
  });
  it('parses without executing custom code and returns a valid version-1 project', () => {
    const code='globalThis.__shareExecuted = true;\r\n// keep\r\ndrums: arrange([2,s("bd").fast(2)],[1,custom(foo)]).gain(amount);\r\n';
    const restored=readShareUrl(link(code));
    expect('__shareExecuted' in globalThis).toBe(false);
    expect(restored.file).toMatchObject({name:'Imported Strudel loop',version:1,code,lastGoodCode:code});
    expect(readProjectFile(serializeProject(restored.file)).document.code).toBe(code);
  });
  it('rejects invalid JavaScript without producing a replacement project', () => {
    expect(() => readShareUrl(link('s('))).toThrow('syntax error');
  });
});
