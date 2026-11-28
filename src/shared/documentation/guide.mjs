/** Stable section identifiers shared by the navigation and local search. */
export function guideSections(markdown) {
  return markdown.split(/^## /m).slice(1).map((section, index) => {
    const newline = section.indexOf('\n');
    return { id: `section-${index + 1}`, title: section.slice(0, newline).trim(),
      body: section.slice(newline + 1).trim() };
  });
}
export function searchGuide(sections, query) {
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return sections.filter(section => words.every(word => normalize(section.title + ' ' + section.body).includes(word)));
}
