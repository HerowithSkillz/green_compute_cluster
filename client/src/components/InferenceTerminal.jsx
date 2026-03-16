import React, { useState, useRef, useEffect } from 'react';

export default function InferenceTerminal({ onSubmit, tokens, isGenerating, streamingFrom }) {
  const [prompt, setPrompt] = useState('');
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [tokens]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSubmit(prompt.trim());
    setPrompt('');
  };

  const formatEntryText = (entry) => {
    if (entry.role !== 'assistant') return entry.text;
    return entry.text
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\r\n/g, '\n');
  };

  return (
    <div className="inference-terminal">
      <div className="terminal-header">
        <span className="terminal-title">Inference Terminal</span>
        {isGenerating && (
          <span className="terminal-streaming">
            Streaming from: {streamingFrom || 'local'}
          </span>
        )}
      </div>

      <div className="terminal-output" ref={outputRef}>
        {tokens.length === 0 ? (
          <span className="terminal-placeholder">Inference output will appear here...</span>
        ) : (
          tokens.map((entry, i) => (
            <div key={i} className={`terminal-entry terminal-entry-${entry.role}`}>
              <span className="entry-role">{entry.role === 'user' ? '> ' : '< '}</span>
              <span className="entry-text">{formatEntryText(entry)}</span>
            </div>
          ))
        )}
        {isGenerating && <span className="terminal-cursor">▋</span>}
      </div>

      <form className="terminal-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt..."
          disabled={isGenerating}
          autoFocus
        />
        <button type="submit" disabled={isGenerating || !prompt.trim()}>
          {isGenerating ? 'Generating...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
