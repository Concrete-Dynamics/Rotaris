import { Fragment, type ReactNode } from 'react';
import { markdownCache } from './cache.js';
import type { Block, ListItem, Span } from './parse.js';
import { Button as DesignButton, Input as DesignInput, Table as DesignTable } from '../design-system/index.js';

/**
 * ADR-0051, alternative B: the tree rendered to ELEMENTS. No markup string is produced and nothing is
 * injected — every element type this file can emit is written here, which is `REQ-CHAT-056`'s enumerated
 * treatments as a closed list. Selection stays native because the output is document elements
 * (`REQ-CHAT-075`).
 *
 * **Links are elements that request an external open through the command channel, never navigable anchors**
 * (ADR-0051): the renderer is sandboxed and must not navigate, so a link is a button that calls `onOpenLink`
 * with the href. A surface that passes none renders the link's text with its target as the title — the
 * activation is what is unavailable there, never the text.
 *
 * **No image is ever loaded** (`REQ-CHAT-056`): an image reference renders as its alternative text carrying
 * the same activatable reference a link has. There is no `<img>` in this file, and there is no HTML
 * rendering either — raw HTML in the source arrives here inside a text node and is shown as the text it is.
 */
export interface MarkdownProps {
  readonly source: string;
  /** REQ-CHAT-076: `http(s)` links open in the system browser, through the caller's command channel. */
  readonly onOpenLink?: ((href: string) => void) | undefined;
  readonly className?: string | undefined;
  /** Verification: the tab's and the inspector's probes read the rendered body by this attribute. */
  readonly testId?: string | undefined;
}

function Spans({ spans, onOpenLink }: { spans: readonly Span[]; onOpenLink?: ((href: string) => void) | undefined }): ReactNode {
  return spans.map((span, index) => {
    switch (span.kind) {
      case 'text': return <Fragment key={index}>{span.text}</Fragment>;
      case 'code': return <code key={index} className="md__code">{span.text}</code>;
      case 'strong': return <strong key={index} className="md__strong"><Spans spans={span.spans} onOpenLink={onOpenLink} /></strong>;
      case 'em': return <em key={index} className="md__em"><Spans spans={span.spans} onOpenLink={onOpenLink} /></em>;
      case 'strike': return <s key={index} className="md__strike"><Spans spans={span.spans} onOpenLink={onOpenLink} /></s>;
      case 'link':
        return (
          <DesignButton key={index} type="button" className="md__link" title={span.href} data-href={span.href}
            onClick={() => onOpenLink?.(span.href)} disabled={onOpenLink === undefined}>
            <Spans spans={span.spans} onOpenLink={onOpenLink} />
          </DesignButton>
        );
      case 'image':
        return (
          <DesignButton key={index} type="button" className="md__link md__image" title={span.href} data-image-href={span.href}
            onClick={() => onOpenLink?.(span.href)} disabled={onOpenLink === undefined}>
            {span.alt === '' ? span.href : span.alt}
          </DesignButton>
        );
      default: return null;
    }
  });
}

function Item({ item, onOpenLink }: { item: ListItem; onOpenLink?: ((href: string) => void) | undefined }): ReactNode {
  return (
    <li className={item.task === null ? 'md__item' : 'md__item md__item--task'}>
      {item.task !== null && <DesignInput type="checkbox" className="md__task" checked={item.task} readOnly aria-label={item.task ? 'done' : 'not done'} />}
      <Blocks blocks={item.blocks} onOpenLink={onOpenLink} />
    </li>
  );
}

function Blocks({ blocks, onOpenLink }: { blocks: readonly Block[]; onOpenLink?: ((href: string) => void) | undefined }): ReactNode {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'paragraph': return <p key={index} className="md__p"><Spans spans={block.spans} onOpenLink={onOpenLink} /></p>;
      case 'heading': {
        const props = { key: index, className: `md__h md__h${block.level}` };
        const inner = <Spans spans={block.spans} onOpenLink={onOpenLink} />;
        // The element list is closed and written out: six heading levels and nothing computed into a tag name.
        if (block.level === 1) return <h1 {...props}>{inner}</h1>;
        if (block.level === 2) return <h2 {...props}>{inner}</h2>;
        if (block.level === 3) return <h3 {...props}>{inner}</h3>;
        if (block.level === 4) return <h4 {...props}>{inner}</h4>;
        if (block.level === 5) return <h5 {...props}>{inner}</h5>;
        return <h6 {...props}>{inner}</h6>;
      }
      case 'code': return <pre key={index} className="md__pre" data-language={block.language} data-closed={block.closed ? 'yes' : 'no'}><code>{block.text}</code></pre>;
      case 'quote': return <blockquote key={index} className="md__quote"><Blocks blocks={block.blocks} onOpenLink={onOpenLink} /></blockquote>;
      case 'list':
        return block.ordered
          ? <ol key={index} className="md__list" start={block.start}>{block.items.map((item, n) => <Item key={n} item={item} onOpenLink={onOpenLink} />)}</ol>
          : <ul key={index} className="md__list">{block.items.map((item, n) => <Item key={n} item={item} onOpenLink={onOpenLink} />)}</ul>;
      case 'table':
        return (
          <DesignTable key={index} className="md__table">
            <thead><tr>{block.header.map((cell, n) => <th key={n} className={block.align[n] ? `md__cell--${block.align[n]}` : undefined}><Spans spans={cell} onOpenLink={onOpenLink} /></th>)}</tr></thead>
            <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n} className={block.align[n] ? `md__cell--${block.align[n]}` : undefined}><Spans spans={cell} onOpenLink={onOpenLink} /></td>)}</tr>)}</tbody>
          </DesignTable>
        );
      case 'break': return <hr key={index} className="md__rule" />;
      default: return null;
    }
  });
}

/** Rendering is synchronous and issues no network request (`REQ-CHAT-056`); the parse goes through the bounded cache. */
export function Markdown({ source, onOpenLink, className, testId }: MarkdownProps) {
  const document = markdownCache.parse(source);
  return (
    <div className={className ? `md ${className}` : 'md'} data-testid={testId} data-md-chars={String(document.sourceLength)}>
      <Blocks blocks={document.blocks} onOpenLink={onOpenLink} />
    </div>
  );
}
