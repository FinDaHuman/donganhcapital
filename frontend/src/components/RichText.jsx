import React from 'react';

// Lightweight, dependency-free renderer for the small Markdown subset the AI
// chatbot/news-analysis produces: **bold**, "* " / "- " bullet lists, "#" headings,
// and paragraph/line breaks. Everything is rendered through React text nodes (no
// dangerouslySetInnerHTML), so untrusted model output can't inject markup.

const BOLD_RE = /\*\*(.+?)\*\*/g;

// Split a line into plain text + <strong> nodes on **bold** spans.
function renderInline(text, keyPrefix) {
    const nodes = [];
    let last = 0;
    let i = 0;
    let m;
    BOLD_RE.lastIndex = 0;
    while ((m = BOLD_RE.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{m[1]}</strong>);
        last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes.length ? nodes : [text];
}

export default function RichText({ text, className, style }) {
    const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let bullets = null; // accumulates consecutive bullet items

    const flush = () => {
        if (bullets && bullets.length) {
            blocks.push(
                <ul key={`ul-${blocks.length}`} className="list-disc pl-5 my-1.5 space-y-1">
                    {bullets.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
            );
        }
        bullets = null;
    };

    lines.forEach((raw, idx) => {
        const line = raw.replace(/\s+$/, '');
        const bullet = line.match(/^\s*[*-]\s+(.*)$/);   // "* x" / "- x" (not "**bold**")
        const heading = line.match(/^\s*#{1,6}\s+(.*)$/); // "# x"
        if (bullet) {
            (bullets || (bullets = [])).push(renderInline(bullet[1], `li-${idx}`));
        } else if (line.trim() === '') {
            flush();
            blocks.push(<div key={`sp-${idx}`} style={{ height: 6 }} />);
        } else if (heading) {
            flush();
            blocks.push(
                <p key={`h-${idx}`} className="my-1 font-semibold">
                    {renderInline(heading[1], `h-${idx}`)}
                </p>
            );
        } else {
            flush();
            blocks.push(<p key={`p-${idx}`} className="my-0.5">{renderInline(line, `p-${idx}`)}</p>);
        }
    });
    flush();

    return <div className={className} style={style}>{blocks}</div>;
}
