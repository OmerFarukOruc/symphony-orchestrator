import { EditorView, basicSetup } from "codemirror";
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Compartment, EditorState, type Range } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";

/**
 * CodeMirror plugin that highlights Jinja2/Liquid template expressions
 * ({{ ... }} and {% ... %}) with inline mark decorations.
 */
const jinja2VarMark = Decoration.mark({ class: "cm-jinja2-var" });
const jinja2TagMark = Decoration.mark({ class: "cm-jinja2-tag" });

function buildJinja2Decorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc.toString();

  // bounded by template size; no user input
  const varRegex = /\{\{[^}]*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(doc)) !== null) {
    decorations.push(jinja2VarMark.range(match.index, match.index + match[0].length));
  }

  const tagRegex = /\{%[^%]*%\}/g;
  while ((match = tagRegex.exec(doc)) !== null) {
    decorations.push(jinja2TagMark.range(match.index, match.index + match[0].length));
  }

  return Decoration.set(decorations, true);
}

const jinja2Highlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildJinja2Decorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = buildJinja2Decorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const jinja2Theme = EditorView.baseTheme({
  ".cm-jinja2-var": {
    color: "var(--text-accent)",
    fontWeight: "600",
    background: "color-mix(in srgb, var(--text-accent) 10%, transparent)",
    borderRadius: "2px",
    padding: "0 2px",
  },
  ".cm-jinja2-tag": {
    color: "var(--status-claimed)",
    fontWeight: "600",
    background: "color-mix(in srgb, var(--status-claimed) 10%, transparent)",
    borderRadius: "2px",
    padding: "0 2px",
  },
});

export interface TemplateEditorOptions {
  parent: HTMLElement;
  initialValue: string;
  onChange: (value: string) => void;
}

export interface TemplateEditor {
  view: EditorView;
  getValue: () => string;
  setValue: (value: string) => void;
  destroy: () => void;
}

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

export function createTemplateEditor(options: TemplateEditorOptions): TemplateEditor {
  const themeCompartment = new Compartment();

  const extensions = [
    basicSetup,
    html(),
    jinja2Highlight,
    jinja2Theme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString());
      }
    }),
    themeCompartment.of(isDarkTheme() ? oneDark : []),
  ];

  const view = new EditorView({
    state: EditorState.create({
      doc: options.initialValue,
      extensions,
    }),
    parent: options.parent,
  });

  const onThemeChange = (): void => {
    view.dispatch({
      effects: themeCompartment.reconfigure(isDarkTheme() ? oneDark : []),
    });
  };
  window.addEventListener("theme:change", onThemeChange);

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    },
    destroy: () => {
      window.removeEventListener("theme:change", onThemeChange);
      view.destroy();
    },
  };
}
