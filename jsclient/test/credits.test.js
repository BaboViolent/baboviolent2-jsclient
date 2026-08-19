import test from 'node:test';
import assert from 'node:assert/strict';

import { NATIVE_CREDITS } from '../public/src/ui/menu2.js';

test('browser credits exactly retain the native CCredit entries and order', () => {
  assert.deepEqual(NATIVE_CREDITS, [
    { role: 'Game Designer', names: ['David St-Louis "\x03RndLabs"'] },
    { role: 'Programmers', names: [
      'David St-Louis "\x03RndLabs"', 'Marc Durocher "\x03RndLabs"',
      'Jason "nuvem" Kozak', 'Dominik "cnik" Kornaus',
      'Paulius "PM" Maruska', 'Louis "Lordlou" Poirier',
    ] },
    { role: 'Modeling / Graphics', names: [
      'Adam Pilkington "\x03HeadGames Art Lead"', 'David St-Louis "\x03RndLabs"',
      'Louis-Nicolas Dozois "\x03HeadGames"', 'Michal "Pacifist" Mojzik',
    ] },
    { role: 'Sound designers', names: ['Dominic "Doimuk" Valiquette'] },
    { role: 'Music samples', names: ['Lamb of God'] },
    { role: 'Quality Control', names: [
      'Sunita Kollipara "\x03HeadGames"',
      'Whole www.baboviolent.net community - Thanks guys!',
    ] },
  ]);
});
