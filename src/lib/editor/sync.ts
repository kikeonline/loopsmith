import { ChangeSet, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, invertedEffects, isolateHistory, undo, redo } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { ProjectSession, type ParsedDocument, type Span } from '../project';
import { carryModifierReferences } from './modifiers';
import { carryArrangementReferences } from './arrangement';

export interface SyncState {
  document: ParsedDocument;
  error: string;
  editError: string;
  queued: number;
  lastEditSource: 'code' | 'ui-sync' | 'history';
}
export type VisualEdit = (document: ParsedDocument) => ParsedDocument;
interface SyncOptions {
  initialDocument?: ParsedDocument;
  draftChanged?: (code: string, document: ParsedDocument) => void;
  projectLoaded?: () => void;
}
const projectAnchor = StateEffect.define<{ before: ParsedDocument; after: ParsedDocument }>();
const eventRanges = StateEffect.define<readonly Span[]>();
const playheadRanges = StateField.define<readonly Span[]>({
  create: () => [],
  update(ranges,transaction) {
    if (transaction.docChanged) return [];
    return transaction.effects.find(effect => effect.is(eventRanges))?.value ?? ranges;
  },
  provide: field => EditorView.decorations.from(field,ranges => Decoration.set(ranges.map(range => Decoration.mark({class:'cm-event-playhead'}).range(range.from,range.to)),true))
});
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: '#dfb888' },
  { tag: tags.string, color: '#c3ed87' },
  { tag: tags.number, color: '#9ecbe0' },
  { tag: tags.comment, color: '#8e9d81', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#e0e8d7' },
  { tag: tags.propertyName, color: '#b1d1a1' }
]);

/** One editor, one history, and semantic queued operations rather than stale offsets. */
export class EditorSync {
  readonly view: EditorView;
  private draftCode: string;
  get code() { return this.draftCode; }
  setPlayhead(ranges: readonly Span[], source: string) {
    const next = source === this.draftCode ? ranges.filter(range => Number.isInteger(range.from) && Number.isInteger(range.to) && range.from >= 0 && range.to <= source.length && range.from < range.to) : [];
    const previous = this.view.state.field(playheadRanges);
    if (JSON.stringify(previous) !== JSON.stringify(next)) this.view.dispatch({effects:eventRanges.of(next),annotations:Transaction.addToHistory.of(false)});
  }
  private session: ProjectSession;
  private timer?: ReturnType<typeof setTimeout>;
  private queueTimer?: ReturnType<typeof setTimeout>;
  private typedAt = -Infinity;
  private pending: VisualEdit[] = [];
  private state: SyncState;
  private destroyed = false;

  constructor(parent: HTMLElement, code: string, private changed: (state: SyncState, validCode?: string) => void, private options: SyncOptions = {}) {
    this.draftCode = code;
    this.session = new ProjectSession(options.initialDocument?.code ?? code);
    if (options.initialDocument) this.session.document = options.initialDocument;
    this.state = { document: this.session.document, error: '', editError: '', queued: 0, lastEditSource: 'code' };
    this.view = new EditorView({ parent, state: EditorState.create({ doc: code, extensions: [
      history(), playheadRanges, lineNumbers(), highlightActiveLine(), javascript(), syntaxHighlighting(colors),
      // Split only LF: CR characters remain source bytes, including in mixed-ending imports.
      EditorState.lineSeparator.of('\n'),
      invertedEffects.of(transaction => transaction.effects.filter(effect => effect.is(projectAnchor)).map(effect => projectAnchor.of({ before: effect.value.after, after: effect.value.before }))),
      keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Strudel code', spellcheck: 'false' }),
      EditorView.theme({ '&': { height: '100%', background: '#111710', color: '#d2efa9' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: '14px' }, '.cm-content': { minHeight: '280px' }, '.cm-gutters': { background: '#171e14', color: '#849575', border: 'none' }, '.cm-activeLine': { background: '#c3ed8708' }, '&.cm-focused': { outline: 'none' }, '.cm-cursor': { borderLeftColor: '#c3ed87' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: '#435535' } }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) this.draftCode = update.state.doc.toString();
        const anchor = update.transactions.flatMap(transaction => transaction.effects).find(effect => effect.is(projectAnchor));
        if (!update.docChanged && !anchor) return;
        if (anchor) { this.options.projectLoaded?.(); this.session.document = anchor.value.after; }
        const ui = update.transactions.some(t => t.isUserEvent('ui-sync'));
        const historical = update.transactions.some(t => t.isUserEvent('undo') || t.isUserEvent('redo'));
        this.state.lastEditSource = ui ? 'ui-sync' : historical ? 'history' : 'code';
        clearTimeout(this.timer);
        this.options.draftChanged?.(this.view.state.doc.toString(), this.session.document);
        if (ui || historical || anchor) this.parse();
        else {
          this.typedAt = Date.now();
          this.timer = setTimeout(() => this.parse(), 200);
        }
      })
    ] }) });
    this.parse(false);
  }
  private notify(validCode?: string) {
    this.changed({ ...this.state, document: this.session.document, queued: this.pending.length }, validCode);
  }
  private parse(persist = true) {
    if (this.destroyed) return;
    const code = this.view.state.doc.toString();
    const parsed = this.session.update(code);
    this.state.error = parsed.ok ? '' : `Line ${parsed.error.line}, column ${parsed.error.column + 1}: ${parsed.error.message}`;
    this.notify(parsed.ok ? code : undefined);
    if (persist) this.options.draftChanged?.(code, this.session.document);
    if (parsed.ok && this.pending.length) this.scheduleQueue();
  }
  edit(operation: VisualEdit) {
    this.state.editError = '';
    this.pending.push(operation);
    this.notify();
    this.scheduleQueue();
  }
  private scheduleQueue() {
    clearTimeout(this.queueTimer);
    const delay = Math.max(0, 1000 - (Date.now() - this.typedAt));
    if (delay) this.queueTimer = setTimeout(() => this.flush(), delay);
    else this.flush();
  }
  private flush() {
    if (Date.now() - this.typedAt < 1000) { this.scheduleQueue(); return; }
    // Always parse current text, even if the debounce has not run yet.
    const result = this.session.update(this.view.state.doc.toString());
    if (!result.ok) { this.parse(); return; }
    const operations = this.pending.splice(0);
    let document = this.session.document;
    try {
      let changes = ChangeSet.empty(document.code.length);
      for (const operation of operations) {
        const before = document.code;
        const previousDocument = document;
        document = operation(document);
        carryModifierReferences(previousDocument, document);
        carryArrangementReferences(previousDocument, document);
        const after = document.code;
        let from = 0;
        while (from < before.length && from < after.length && before[from] === after[from]) from++;
        let end = before.length, nextEnd = after.length;
        while (end > from && nextEnd > from && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
        changes = changes.compose(ChangeSet.of({ from, to: end, insert: after.slice(from, nextEnd) }, before.length, '\n'));
      }
      if (!changes.empty) {
        this.view.dispatch({ changes, annotations: [Transaction.userEvent.of('ui-sync'), isolateHistory.of('full')] });
      } else this.notify();
    } catch (cause) {
      this.state.editError = `Visual edit could not be applied: ${cause instanceof Error ? cause.message : String(cause)}`;
      this.notify();
    }
  }
  undo() { undo(this.view); }
  redo() { redo(this.view); }
  snapshot() { this.parse(); return { code: this.view.state.doc.toString(), document: this.session.document }; }
  load(code: string, document: ParsedDocument) {
    clearTimeout(this.timer); clearTimeout(this.queueTimer);
    this.pending = []; this.typedAt = -Infinity; this.state.editError = '';
    this.session.update(this.view.state.doc.toString());
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: code }, selection: { anchor: 0 },
      effects: projectAnchor.of({ before: this.session.document, after: document }),
      annotations: [Transaction.userEvent.of('project-load'), isolateHistory.of('full')]
    });
  }
  destroy() { this.destroyed = true; clearTimeout(this.timer); clearTimeout(this.queueTimer); this.view.destroy(); }
}
