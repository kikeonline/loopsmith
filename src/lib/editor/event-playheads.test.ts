import { describe,expect,it } from 'vitest';
import { parseDocument, type ParsedDocument, type Track } from '../project';
import { activeSourceSpans,eventSteps,mergeSpans } from './event-playheads';
import { readArrangement,sectionProxy } from './arrangement';
import type { OutputEvent } from './output';
const parse=(code:string) => { const parsed=parseDocument(code);if(!parsed.ok)throw Error(parsed.error.message);return parsed.document; };
const track=(document:ParsedDocument) => document.project.items.find((item):item is Track => item.kind==='track')!;
const range=(code:string,text:string) => ({from:code.indexOf(text),to:code.indexOf(text)+text.length});
const event=(source:string,locations:OutputEvent['locations'],start=100,end=500):OutputEvent => ({id:1,source,locations,start,end,note:null,sound:'bd'});
describe('source-backed event playheads',()=>{
  it('uses scheduled gates, excludes future/expired events, and requires the exact source version',()=>{
    const code='drums:s("bd sd").rev().fast(2)',bd=range(code,'bd'),sd=range(code,'sd');
    expect(activeSourceSpans([event(code,[bd]),event(code,[sd],500,800),event('other',[sd])],200,code)).toEqual([bd]);
    expect(activeSourceSpans([event(code,[bd])],500,code)).toEqual([]);
    expect(activeSourceSpans([event(code,[bd])],NaN,code)).toEqual([]);
  });
  it('validates literal boundaries and merges duplicated/overlapping locations',()=>{
    const code='const foo=1; drums:s("bd sd");';
    const bd=range(code,'bd'),sd=range(code,'sd');
    expect(activeSourceSpans([event(code,[bd,bd,{from:bd.from+1,to:bd.to},sd,range(code,'foo'),{from:-1,to:2},{from:0,to:999},{from:2.5,to:3}])],200,code)).toEqual([bd,sd]);
    expect(mergeSpans([{from:3,to:5},{from:1,to:4}])).toEqual([{from:1,to:5}]);
  });
  it('keeps Unicode/CRLF and multiline template positions, skipping cooked escapes and interpolated templates',()=>{
    const code='// 🌊\r\ndrums:s(`bd\nsd`); hats:s("b\\u0064 hh");';
    const bd=range(code,'bd'),sd=range(code,'sd');
    expect(activeSourceSpans([event(code,[bd,sd,range(code,'hh')])],200,code)).toEqual([bd,sd]);
    const custom='drums:s(`bd ${custom}`)';expect(activeSourceSpans([event(custom,[range(custom,'bd')])],200,custom)).toEqual([]);
  });
  it('maps drum rows independently and only highlights atoms whose source locations fired',()=>{
    const document=parse('drums:s("bd ~,hh hh").fast(2)');const code=document.code;
    const firstHat=range(code,'hh');
    expect(eventSteps(document,track(document).id,[firstHat])).toEqual([[false,false],[true,false]]);
    expect(eventSteps(document,track(document).id,[range(code,'~')])).toEqual([[false,false],[false,false]]);
  });
  it('maps degree/pitch slots and declines nested timing and escaped string sources',()=>{
    for(const code of ['lead:note("c3 ~ eb3")','lead:n("0 ~ 2").scale("C:minor")']){
      const document=parse(code),argument=document.tracks[track(document).id].sourceArgument!;
      expect(eventSteps(document,track(document).id,[{from:argument.from+1,to:argument.from+2}])).toEqual([[true,false,false]]);
    }
    for(const code of ['drums:s("[bd sd] hh")','drums:s("b\\u0064 sd")']){
      const document=parse(code);expect(eventSteps(document,track(document).id,[range(code,'sd')])).toEqual([]);
    }
  });
  it('translates arrangement proxy offsets without attributing another section to the selected pattern',()=>{
    const document=parse('drums:arrange([1,s("bd sd")],[2,s("cp hh")]).fast(2)');const id=track(document).id;
    const section=readArrangement(document,id)!.sections[1],proxy=sectionProxy(document,id,section.id);
    expect(eventSteps(proxy.document,proxy.track.id,[range(document.code,'cp')],section.pattern.from-proxy.prefix.length)).toEqual([[true,false]]);
    expect(eventSteps(proxy.document,proxy.track.id,[range(document.code,'bd')],section.pattern.from-proxy.prefix.length)).toEqual([[false,false]]);
  });
});
