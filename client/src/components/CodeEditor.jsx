import { useEffect, useRef } from 'react';
import { MonacoBinding } from 'y-monaco';
import { getLanguage } from '../../../shared/rooms.js';
import { monaco } from '../editor/monaco.js';

/**
 * Monaco bound to the room's Y.Text through y-monaco: local edits become CRDT updates, remote edits
 * arrive without moving your cursor, and y-monaco draws other people's cursors from awareness.
 */
export default function CodeEditor({ doc, awareness, language, theme, onRun }) {
  const host = useRef(null);
  const editorRef = useRef(null);
  const runRef = useRef(onRun);
  runRef.current = onRun;

  useEffect(() => {
    if (!doc || !awareness || !host.current) return undefined;
    const model = monaco.editor.createModel('', getLanguage(language)?.monaco ?? 'plaintext');
    const editor = monaco.editor.create(host.current, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "'Spline Sans Mono Variable', ui-monospace, Consolas, monospace",
      fontSize: 14,
      lineHeight: 22,
      padding: { top: 20, bottom: 12 },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      tabSize: 2,
      ariaLabel: 'Shared code editor. Press Control Enter to run.',
    });
    editorRef.current = editor;
    const binding = new MonacoBinding(doc.getText('code'), model, new Set([editor]), awareness);

    // Publish the line you are on so the people list can show it.
    const cursorSub = editor.onDidChangeCursorPosition((e) => {
      awareness.setLocalStateField('cursor', { line: e.position.lineNumber });
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());

    return () => {
      cursorSub.dispose();
      binding.destroy();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // The language is applied by the effect below without rebuilding the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, awareness]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelLanguage(model, getLanguage(language)?.monaco ?? 'plaintext');
  }, [language]);

  useEffect(() => {
    monaco.editor.setTheme(theme === 'light' ? 'cc-light' : 'cc-dark');
  }, [theme]);

  return <div className="editor-host" ref={host} />;
}
