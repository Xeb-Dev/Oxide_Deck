import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  children: string;
  className?: string;
  style?: React.CSSProperties;
  /** Block-level wrapper tag. Defaults to "div". Use "span" for compact inline uses. */
  as?: "div" | "span" | "p";
}

/**
 * Renders a string that may contain LaTeX math expressions.
 *
 * Supported delimiters (same as common LaTeX conventions):
 *   - $$...$$  → display (block) math
 *   - $...$    → inline math
 *   - \[...\]  → display (block) math
 *   - \(...\)  → inline math
 *
 * Non-math segments are rendered as plain text.
 */
export default function MathText({ children, className, style, as: Tag = "div" }: MathTextProps) {
  if (!children) return null;

  const segments = parseMathSegments(children);

  return (
    <Tag className={className} style={style}>
      {segments.map((seg, i) => {
        if (!seg.isMath) {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
        try {
          const html = katex.renderToString(seg.text, {
            displayMode: seg.displayMode,
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={i}
              className={seg.displayMode ? "math-block" : "math-inline"}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          // Fallback: show raw LaTeX wrapped in code style
          return (
            <code key={i} style={{ fontSize: "0.9em", opacity: 0.8 }}>
              ${seg.text}$
            </code>
          );
        }
      })}
    </Tag>
  );
}

interface Segment {
  text: string;
  isMath: boolean;
  displayMode: boolean;
}

function parseMathSegments(text: string): Segment[] {
  const segments: Segment[] = [];

  // Regex matches (in order of precedence):
  //  1. $$...$$   display block
  //  2. \[...\]   display block
  //  3. $...$     inline
  //  4. \(...\)   inline
  const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\([\s\S]+?\\\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text)) !== null) {
    // Plain text before this math chunk
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMath: false, displayMode: false });
    }

    const raw = match[0];
    let mathContent = raw;
    let displayMode = false;

    if (raw.startsWith("$$") && raw.endsWith("$$")) {
      mathContent = raw.slice(2, -2);
      displayMode = true;
    } else if (raw.startsWith("\\[") && raw.endsWith("\\]")) {
      mathContent = raw.slice(2, -2);
      displayMode = true;
    } else if (raw.startsWith("$") && raw.endsWith("$")) {
      mathContent = raw.slice(1, -1);
    } else if (raw.startsWith("\\(") && raw.endsWith("\\)")) {
      mathContent = raw.slice(2, -2);
    }

    segments.push({ text: mathContent, isMath: true, displayMode });
    lastIndex = match.index + raw.length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMath: false, displayMode: false });
  }

  return segments.length > 0 ? segments : [{ text, isMath: false, displayMode: false }];
}
