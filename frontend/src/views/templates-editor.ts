import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";

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
