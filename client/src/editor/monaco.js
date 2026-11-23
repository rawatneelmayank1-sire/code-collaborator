import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco runs language services in web workers; Vite bundles them from these imports.
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// Editor themes built from the same palette as tokens.css (Monaco needs literal hex values).
monaco.editor.defineTheme('cc-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8a92a6', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c6a2f2' },
    { token: 'string', foreground: '9fd49a' },
    { token: 'number', foreground: 'f5b97a' },
    { token: 'type', foreground: '7fc8f0' },
  ],
  colors: {
    'editor.background': '#171920',
    'editor.foreground': '#e7e9ef',
    'editorLineNumber.foreground': '#6c7387',
    'editorLineNumber.activeForeground': '#e7e9ef',
    'editor.lineHighlightBackground': '#1f2230',
    'editor.selectionBackground': '#f0b24a3d',
    'editorCursor.foreground': '#f0b24a',
    'editorIndentGuide.background1': '#272b37',
    'editorWidget.background': '#1b1e27',
    'editorWidget.border': '#343949',
  },
});

monaco.editor.defineTheme('cc-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5f6678', fontStyle: 'italic' },
    { token: 'keyword', foreground: '6b3fa8' },
    { token: 'string', foreground: '2f6b2b' },
    { token: 'number', foreground: '9a4f12' },
    { token: 'type', foreground: '1f5f9e' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#191c25',
    'editorLineNumber.foreground': '#7a8194',
    'editorLineNumber.activeForeground': '#191c25',
    'editor.lineHighlightBackground': '#f3f4f7',
    'editor.selectionBackground': '#e8a43a47',
    'editorCursor.foreground': '#85570a',
    'editorIndentGuide.background1': '#e6e9ef',
  },
});

export { monaco };
