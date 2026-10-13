import { describe, expect, it } from 'vitest';
import { tintColor } from '../../src/render/palette';

describe('tintColor', () => {
  it('turns blue-dominant colours red the way the J2ME game did', () => {
    expect(tintColor(40, 80, 200, 'red')).toEqual([200, 40, 40]);
  });

  it('greys blue-dominant colours using the blue channel', () => {
    expect(tintColor(40, 80, 200, 'grey')).toEqual([200, 200, 200]);
  });

  it('leaves skin, steel and other non-blue colours alone', () => {
    expect(tintColor(220, 180, 140, 'red')).toEqual([220, 180, 140]);
    expect(tintColor(128, 128, 128, 'red')).toEqual([128, 128, 128]);
  });
});
