import { CHANGELOG } from '../changelog';
import { h, modal } from '../dom';

export function showWhatsNew() {
  modal(
    [
      h('h2', {}, 'What’s new'),
      ...CHANGELOG.flatMap((entry) => [
        h('h3', {}, entry.date),
        h('ul', {}, ...entry.changes.map((change) => h('li', {}, change))),
      ]),
    ],
    { dismissable: true, class: 'whats-new' },
  );
}
