import { TextHighlight } from '@/types/chat';

interface HighlightedTextProps {
  content: string;
  highlights?: TextHighlight[];
  className?: string;
}

export function HighlightedText({ content, highlights = [], className = '' }: HighlightedTextProps) {
  if (!highlights.length) {
    return <span className={className}>{content}</span>;
  }

  // Sort highlights by start index
  const sortedHighlights = [...highlights].sort((a, b) => a.startIndex - b.startIndex);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedHighlights.forEach((highlight, index) => {
    // Add non-highlighted text before this highlight
    if (highlight.startIndex > lastIndex) {
      parts.push(
        <span key={`text-${index}`}>
          {content.slice(lastIndex, highlight.startIndex)}
        </span>
      );
    }

    // Add highlighted text
    const highlightedText = content.slice(highlight.startIndex, highlight.endIndex);
    parts.push(
      <span
        key={`highlight-${index}`}
        className={highlight.type === 'positive' ? 'highlight-positive' : 'highlight-negative'}
        title={highlight.reason}
      >
        {highlightedText}
      </span>
    );

    lastIndex = highlight.endIndex;
  });

  // Add remaining text after last highlight
  if (lastIndex < content.length) {
    parts.push(
      <span key="text-end">{content.slice(lastIndex)}</span>
    );
  }

  return <span className={className}>{parts}</span>;
}
