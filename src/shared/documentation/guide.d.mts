export interface GuideSection { id: string; title: string; body: string }
export function guideSections(markdown: string): GuideSection[];
export function searchGuide(sections: GuideSection[], query: string): GuideSection[];
