import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, TextField } from '../components/ui';
import { LanguageContext, translate, useI18n } from '../preferences/i18n';
import { guideSections, searchGuide } from '../../shared/documentation/guide.mjs';
import italian from '../../../.github/GUIDA-UTENTE.md?raw';
import english from '../../../.github/USER-GUIDE.md?raw';
import './documentation.css';

function inline(text: string): ReactNode {
  return text.split(/(\*\*.*?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    // Repository-relative links are rendered as text in the offline guide.
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return <span key={index}>{link ? link[1] : part}</span>;
  });
}
function Article({ body }: { body: string }) {
  return body.split(/\n\s*\n/).map((block, index) => {
    if (block.startsWith('### ')) return <h3 id={`heading-${index}`} key={index}>{inline(block.slice(4))}</h3>;
    const lines = block.split('\n');
    if (lines[0].startsWith('|')) {
      const rows = lines.filter(line => !/^\|[ :|-]+\|$/.test(line)).map(line => line.split('|').slice(1, -1));
      return <div className="guide-table" key={index}><table><thead><tr>{rows[0].map((cell, i) =>
        <th key={i} scope="col">{inline(cell.trim())}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, i) =>
        <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell.trim())}</td>)}</tr>)}</tbody></table></div>;
    }
    if (/^(?:- |\d+\. )/.test(block)) {
      const items = block.split(/\n(?=- |\d+\. )/).map(item => item.replace(/^(?:- |\d+\. )/, ''));
      const children = items.map((item, i) => <li key={i}>{inline(item)}</li>);
      return block.startsWith('- ') ? <ul key={index}>{children}</ul> : <ol key={index}>{children}</ol>;
    }
    return <p key={index}>{inline(block)}</p>;
  });
}
export function DocumentationPage({ onBack }: { onBack: () => void }) {
  const t = useI18n();
  const language = useContext(LanguageContext);
  const sections = guideSections(language === 'it' ? italian : english);
  const [selected, setSelected] = useState('section-1');
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const article = useRef<HTMLElement>(null);
  const results = searchGuide(sections, query);
  const current = sections.find(section => section.id === selected) ?? sections[0];
  const headings = current.body.split(/\n\s*\n/).flatMap((block, index) =>
    block.startsWith('### ') ? [{ id: `heading-${index}`, title: block.slice(4) }] : []);
  useEffect(() => {
    const previous = document.title;
    document.title = `${translate(language, 'User guide')} · Rokko`;
    return () => { document.title = previous; };
  }, [language]);
  function open(id: string) {
    setSelected(id);
    setQuery('');
    requestAnimationFrame(() => { article.current?.focus(); article.current?.scrollIntoView({ block: 'start' }); });
  }
  return <div className="settings-page documentation-page">
    <header className="page-heading"><div><p className="page-note">ROKKO / {t('Documentation')}</p>
      <h1>{t('User guide')}</h1><p>{t('Practical help, available offline.')}</p></div>
      <Button variant="secondary" onClick={onBack}>{t('Back to settings')}</Button></header>
    <div className="guide-search"><TextField ref={input} type="search" label={t('Search the documentation')}
      value={query} onChange={event => setQuery(event.target.value)} />
      {query && <Button variant="secondary" onClick={() => { setQuery(''); input.current?.focus(); }}>
        {t('Clear search')}</Button>}</div>
    <div className="guide-layout"><nav className="guide-navigation" aria-label={t('Guide topics')}>
      {sections.map((section, index) => <button key={section.id} type="button"
        aria-current={!query && current.id === section.id ? 'page' : undefined} onClick={() => open(section.id)}>
        <span>{String(index + 1).padStart(2, '0')}</span>{section.title}</button>)}
    </nav>
    <article className="guide-article" ref={article} tabIndex={-1} aria-label={t('Documentation')}>
      {query.trim() ? <><h2>{t('Search results')}</h2><p role="status">{t('{count} topics found', { count: results.length })}</p>
        {!results.length && <p>{t('Try another word, such as workspace, account or notifications.')}</p>}
        {results.map(section => <button className="guide-result" type="button" key={section.id} onClick={() => open(section.id)}>
          <strong>{section.title}</strong><span>{section.body.replace(/[*`#]/g, '').slice(0, 180)}…</span>
        </button>)}</> : <><h2>{current.title}</h2><Article key={current.id} body={current.body} />
          <footer className="guide-pagination">{sections.map((section, index) => section.id === current.id &&
            <div key={section.id}>{index > 0 && <Button variant="secondary" onClick={() => open(sections[index - 1].id)}>
              ← {sections[index - 1].title}</Button>}{index < sections.length - 1 &&
              <Button variant="secondary" onClick={() => open(sections[index + 1].id)}>{sections[index + 1].title} →</Button>}</div>)}</footer></>}
    </article>
    {!query.trim() && headings.length > 0 && <aside className="guide-outline" aria-label={t('On this page')}><strong>{t('On this page')}</strong>
      {headings.map(heading => <a key={heading.id} href={`#${heading.id}`}>{heading.title}</a>)}</aside>}
    </div>
  </div>;
}
