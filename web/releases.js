import {el} from './board.js';
import {releaseEntries} from './release-data.js';

export function releaseHistory(root,game) {
  const list = el('div','release-list');
  list.tabIndex = 0;
  list.setAttribute('role','region');
  list.setAttribute('aria-label','バージョンごとの変更点');
  for (const {version,title,releasedAt,changes} of releaseEntries(game)) {
    const entry = el('article','release-entry');
    const heading = el('h3','release-heading');
    heading.append(el('span','release-version','v'+version),el('span','',title));
    entry.append(heading);
    if (releasedAt) {
      const date = el('time','history-time',releasedAt);
      date.dateTime = releasedAt;
      entry.append(date);
    }
    if (changes?.length) {
      const details = el('ul','release-changes');
      details.append(...changes.map(change=>el('li','',change.description)));
      entry.append(details);
    }
    list.append(entry);
  }
  root.append(list);
}
