/**
 * The card registry — the single place a card is declared.
 *
 * Everything that must know "which cards exist" reads this file: the Vite
 * multi-page inputs (vite.config.js), the landing page links, and the header
 * switcher in the viewer. Adding a card means adding one entry here plus one
 * `<id>/index.html`.
 *
 * Routes spell out index.html because the hosting platform is not guaranteed
 * to resolve a bare directory path.
 *
 * `wip` marks a card whose assets are still being made. Its value is the label
 * shown in its place. A wip card still gets its shell page (so everything works
 * the moment the assets land) but is never linked: the landing tile and the
 * header switcher both render it inert. It stays in this file rather than in a
 * separate "coming soon" list so there is still exactly one place a card lives.
 */
export const cards = [
  {
    id: '001',
    route: '/001/index.html',
    edition: 'No.001',
    title: '不染不染',
    act: '第一弹',
  },
  {
    id: '002',
    route: '/002/index.html',
    edition: 'No.002',
    title: '杳杳心',
    act: '第二弹',
  },
  {
    id: '003',
    route: '/003/index.html',
    edition: 'No.003',
    title: '听云屿',
    act: '第三弹',
  },
  {
    id: '005',
    route: '/005/index.html',
    edition: 'No.005',
    title: '鹊渡枝',
    act: '第五弹',
  },
  {
    id: '006',
    route: '/006/index.html',
    edition: 'No.006',
    title: '塵燼',
    act: '第六弹',
  },
  {
    id: '007',
    route: '/007/index.html',
    edition: 'No.007',
    title: '荼喏',
    act: '第七弹',
  },
];

export default cards;
