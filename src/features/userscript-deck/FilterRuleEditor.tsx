import { Fragment, forwardRef, useDeferredValue, useRef } from 'react';

function NetworkRule({ source }: { source: string }) {
  const optionIndex = source.lastIndexOf('$');
  const pattern = optionIndex > 0 ? source.slice(0, optionIndex) : source;
  const options = optionIndex > 0 ? source.slice(optionIndex) : '';
  let offset = 0;
  const fragments = pattern.split(/([|*^]+)/g).map((fragment) => {
    const start = offset;
    offset += fragment.length;
    return { fragment, key: `${start}:${fragment.length}` };
  });

  return (
    <>
      {fragments.map(({ fragment, key }) =>
        /^[|*^]+$/.test(fragment) ? (
          <span
            key={key}
            className="filter-rule-token filter-rule-token--operator"
          >
            {fragment}
          </span>
        ) : (
          <Fragment key={key}>{fragment}</Fragment>
        ),
      )}
      {options && (
        <span className="filter-rule-token filter-rule-token--options">
          {options}
        </span>
      )}
    </>
  );
}

function HighlightedRule({ source }: { source: string }) {
  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? '';
  const rule = source.slice(leadingWhitespace.length);
  if (!rule) return <>{source}</>;
  if (rule.startsWith('!') || rule.startsWith('# ')) {
    return (
      <>
        {leadingWhitespace}
        <span className="filter-rule-token filter-rule-token--comment">
          {rule}
        </span>
      </>
    );
  }
  if (rule.startsWith('[') && rule.endsWith(']')) {
    return (
      <>
        {leadingWhitespace}
        <span className="filter-rule-token filter-rule-token--header">
          {rule}
        </span>
      </>
    );
  }

  const cosmetic = rule.match(/^(.*?)(#@#|#\?#|#\$#|#%#|##)(.*)$/);
  if (cosmetic) {
    return (
      <>
        {leadingWhitespace}
        <span className="filter-rule-token filter-rule-token--domain">
          {cosmetic[1]}
        </span>
        <span className="filter-rule-token filter-rule-token--operator">
          {cosmetic[2]}
        </span>
        <span className="filter-rule-token filter-rule-token--selector">
          {cosmetic[3]}
        </span>
      </>
    );
  }

  const exception = rule.startsWith('@@');
  return (
    <>
      {leadingWhitespace}
      {exception && (
        <span className="filter-rule-token filter-rule-token--exception">
          @@
        </span>
      )}
      <NetworkRule source={exception ? rule.slice(2) : rule} />
    </>
  );
}

export const FilterRuleEditor = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    'aria-label': string;
    onChange: (value: string) => void;
  }
>(function FilterRuleEditor(
  { value, 'aria-label': ariaLabel, onChange },
  inputRef,
) {
  const highlightedValue = useDeferredValue(value);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  let lineOffset = 0;
  const lines = highlightedValue.split('\n').map((line) => {
    const start = lineOffset;
    lineOffset += line.length + 1;
    return { line, key: `${start}:${line.length}` };
  });

  return (
    <div className="filter-rule-editor">
      <pre ref={highlightRef} className="filter-rule-editor__highlight">
        {lines.map((entry, index) => (
          <Fragment key={entry.key}>
            <HighlightedRule source={entry.line} />
            {index < lines.length - 1 ? '\n' : null}
          </Fragment>
        ))}
      </pre>
      <textarea
        ref={inputRef}
        value={value}
        aria-label={ariaLabel}
        className="filter-rule-editor__input"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          const highlight = highlightRef.current;
          if (!highlight) return;
          highlight.scrollTop = event.currentTarget.scrollTop;
          highlight.scrollLeft = event.currentTarget.scrollLeft;
        }}
      />
    </div>
  );
});
