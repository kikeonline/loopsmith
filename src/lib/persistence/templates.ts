import { createTrack, generateProject, parseMini, type Track, type ChainCall } from '../project';
export interface StarterTemplate { id: string; name: string; description: string; code: string }
const effect = (name: 'gain' | 'pan' | 'lpf' | 'room' | 'attack' | 'release' | 'delay', value: number): ChainCall => ({ kind: 'effect', name, value: { kind: 'number', value } });
const control = (name: 's' | 'scale', value: string): ChainCall => ({ kind: 'control', name, value });
function track(id: string, name: string, key: string, pattern: string, mode: 'drums' | 'note' | 'n', calls: ChainCall[]): Track {
  return { ...createTrack({ id, name, source: mode === 'drums' ? { kind: 'drums', pattern: parseMini(pattern) } : { kind: 'notes', mode, pattern: parseMini(pattern) }, calls }), key };
}
function template(id: string, name: string, description: string, bpm: number, tracks: Track[]): StarterTemplate {
  return { id, name, description, code: generateProject({ version: 1, items: [{ kind: 'tempo', unit: 'cpm', value: { kind: 'number', value: bpm / 4 } }, ...tracks] }) };
}
export const TEMPLATES: StarterTemplate[] = [
  template('basic-beat', 'Basic beat', 'Kick, snare, and hi-hat. Toggle a rest and watch its ~ become a sound.', 110, [
    track('basic-kick','Kick','kick','bd ~ bd ~','drums',[effect('gain',0.7)]),
    track('basic-snare','Snare','snare','~ sd ~ sd','drums',[effect('gain',0.5)]),
    track('basic-hats','Hi-hat','hats','hh hh hh hh','drums',[effect('gain',0.25),effect('pan',0.6)])
  ]),
  template('house-loop', 'House loop', 'Four-on-the-floor drums and a scale-degree bass. Explore C minor.', 124, [
    track('house-kick','Kick','kick','bd bd bd bd','drums',[effect('gain',0.8)]),
    track('house-clap','Clap','clap','~ cp ~ cp','drums',[effect('gain',0.5),effect('room',0.1)]),
    track('house-hats','Hi-hat','hats','~ hh ~ hh ~ hh ~ hh','drums',[effect('gain',0.3)]),
    track('house-bass','Bass','bass','0 ~ 0 2 3 ~ 2 ~','n',[control('scale','C2:minor'),control('s','sawtooth'),effect('gain',0.2),effect('lpf',800),effect('release',0.15)])
  ]),
  template('ambient-pad', 'Ambient pad', 'Parallel rows form a gentle chord using built-in synths.', 60, [
    track('ambient-pad','Pad','pad','c4 ~ ~ ~, e4 ~ ~ ~, g4 ~ ~ ~','note',[control('s','sine'),effect('gain',0.2),effect('attack',0.5),effect('release',3),effect('room',0.5)]),
    track('ambient-chime','Chime','chime','~ g5 ~ e5','note',[control('s','triangle'),effect('gain',0.15),effect('release',1),effect('delay',0.2)])
  ]),
  template('melody-bass', 'Melody + bass', 'Two pitch patterns at different octaves. Change an instrument or a note.', 100, [
    track('duo-melody','Melody','melody','c4 e4 g4 e4 d4 f4 a4 g4','note',[control('s','triangle'),effect('gain',0.25),effect('release',0.2)]),
    track('duo-bass','Bass','bass','c2 ~ g2 ~','note',[control('s','sine'),effect('gain',0.4),effect('release',0.3)])
  ])
];
