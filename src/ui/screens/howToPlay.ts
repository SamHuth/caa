import { h, modal } from '../dom';

export function showHowToPlay() {
  const li = (...c: (string | Node)[]) => h('li', {}, ...c);
  const b = (t: string) => h('strong', {}, t);
  modal(
    [
      h('h2', {}, 'How to play'),
      h('p', {}, 'Get rid of all your cards before everyone else, and beat Angali. Play cards onto the centre pile that match it, or draw if you can’t.'),
      h('h3', {}, 'The deck'),
      h(
        'ul',
        {},
        li('Numbers ', b('0–12'), ', ', b('Skip'), ', ', b('Reverse'), ' and ', b('Draw 2'), ' in red, yellow, green and blue (two of each).'),
        li(b('4 Wild'), ' (choose the next colour) and ', b('4 Draw 4'), ' (next player draws 4, and you choose the colour).'),
        li('One blue 8 is the ', b('Smiley 8 ☺'), '. Played on its own, the next player also draws 2. It can also be added to a draw stack for +2.'),
      ),
      h('h3', {}, 'Special cards'),
      h(
        'ul',
        {},
        li(b('Reverse ⇄'), ' flips the turn order. With two players it works like a Skip.'),
        li(b('Single 7:'), ' you must swap hands with another player. A double 7 cancels this.'),
        li(b('Single 12:'), ' everyone passes their hand to the next player in turn order. A double 12 cancels this.'),
      ),
      h('h3', {}, 'Playing cards'),
      h(
        'ul',
        {},
        li('Match the pile’s ', b('colour'), ' or ', b('number'), ' (Skip on Skip, Draw 2 on Draw 2), or play a ', b('Wild'), '.'),
        li(b('Doubles:'), ' play two identical number cards together (e.g. Red 5 + Red 5).'),
        li(
          b('Sums:'),
          ' play number cards that add up to the pile’s number. The first card must match the pile colour. ',
          h('em', {}, 'Pile Green 7 → Green 2, Red 2, Blue 3.'),
          ' The last card you play becomes the new top card.',
        ),
        li('You ', b('can’t go out'), ' on a Skip, Reverse, Draw 2, Wild or Draw 4, but you can go out on a double or sum.'),
        li('Can’t play? Draw one card at a time until you can, with no limit.'),
        li('The draw pile is ', b('never reshuffled'), '. Once it’s empty, if you can’t play you pass and you’re ', b('out'), ' for the rest of the game.'),
        li('When only one player is left in, the ', b('last person to play a card wins'), ' and scores everyone’s hands as normal.'),
        li('Run out of time and you ', b('draw 2'), ' and your turn passes.'),
      ),
      h('h3', {}, 'Stacking'),
      h(
        'ul',
        {},
        li('Hit by a Draw 2 or Draw 4? Play any ', b('Draw 2'), ', ', b('Draw 4'), ' or the ', b('Smiley 8'), ' to add to it and pass the total on.'),
        li('Can’t (or won’t) stack? ', b('Take'), ' the whole pile of cards and lose your turn.'),
        li('Jump-ins add to the stack too.'),
      ),
      h('h3', {}, 'Jump in!'),
      h('p', {}, 'At any time, even when it’s not your turn, you can slam down the ', b('exact same card'), ' that’s on top of the pile. Play carries on from you.'),
      h('h3', {}, 'Controls'),
      h(
        'ul',
        {},
        li(b('Touch:'), ' tap cards in the order you want to play them, then ', b('swipe up'), ' (or press Play).'),
        li(b('Keyboard:'), ' ←/→ to move, Space to select, Enter to play, D to draw, number keys to pick a colour or player.'),
      ),
      h('h3', {}, 'Scoring'),
      h(
        'ul',
        {},
        li('When someone goes out, they score the points left in everyone else’s hands: numbers are face value, Skip/Reverse/Draw 2 are 10, Wild/Draw 4 are 20.'),
        li('First to the ', b('score limit'), ' wins the round. Win the most rounds (best of N) to win the match.'),
      ),
    ],
    { dismissable: true, class: 'how-to' },
  );
}
