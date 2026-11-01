/**
 * What's New, shown from the bell on the home screen. Add a new entry at the top
 * before every push: one short, player-facing line per change.
 */
export interface ChangelogEntry {
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '1 Nov 2026',
    changes: [
      'New: this What’s New list on the home screen',
      'Your own card count now shows next to your name',
      'The Smiley 8 can be added to a draw stack for +2',
      'Reactions are always on screen, ready to spam',
      'Starting hands can now be 5 to 15 cards',
      'The turn timer now goes down to 5 seconds',
      'The 🎲 button now randomises your avatar too',
      'Your own reactions now rise from the button you tapped',
      'When a draw gives you a playable card, it’s selected ready to send',
      '4 new reactions: 🔥 🤡 👀 🎉',
      'CPUs now spam 3 to 6 emojis when they react',
      'A new row of avatar emojis to pick from',
    ],
  },
  {
    date: '29 Oct 2026',
    changes: [
      'No draw limit: keep drawing until you can play',
      'The draw pile no longer reshuffles. Once it’s empty, if you can’t play you’re out',
      'The last person to play a card wins when everyone else is out',
      'Draw 2s and Draw 4s now stack on each other',
      'A single 7 now forces a hand swap',
      'Added a game timer',
      'Scoreboard ranks by rounds, then score, then hand value',
      'Send emoji reactions during a game, and CPUs react too',
      'Wilds now show the colour that was chosen',
      'Pick a name and avatar, or roll a random name',
      'It’s much easier to see whose turn it is',
      'Your hand is sorted by colour and number',
      'New cards: Reverse, plus special powers for 7, 12 and the Smiley 8',
    ],
  },
];

const count = (entries: ChangelogEntry[]) => entries.reduce((sum, e) => sum + e.changes.length, 0);

export const totalChanges = count(CHANGELOG);
