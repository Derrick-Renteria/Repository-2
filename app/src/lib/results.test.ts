import { describe, it, expect } from 'vitest';
import { compareScore, fmtResult, parsePoints, parseResult, ordinal, resultText, standings } from './results';
import type { Athlete } from './types';
import type { Ctx } from './derive';

const ath = (name: string, p: Partial<Athlete>): Athlete => ({ id: name, eventId: 'e', name, age: null, levelId: 'L', flightId: null, overrideMin: null,
  status: 'Confirmed', notes: '', changedAt: null, srcRow: null, resultMs: null, resultPoints: null, resultStatus: null, resultAt: null, outcome: null, ...p });

describe('results', () => {
  it('parses times and points', () => {
    expect(parseResult('42.31')).toBe(42310);
    expect(parseResult('1:05.40')).toBe(65400);
    expect(parseResult('1:05.4')).toBe(65400);
    expect(parseResult('105.4')).toBe(105400);
    expect(parseResult('abc')).toBeNull();
    expect(parsePoints('7')).toBe(7);
    expect(parsePoints('7.5')).toBe(7.5);
    expect(parsePoints('')).toBeNull();
    expect(parsePoints('x')).toBeNaN();
  });
  it('formats', () => {
    expect(fmtResult(65400)).toBe('1:05.40');
    expect(resultText(ath('a', { resultStatus: 'Finished', resultPoints: 7, resultMs: 42310 }))).toBe('7 pts · 42.31');
    expect(resultText(ath('a', { resultStatus: 'DNF', resultPoints: 5 }))).toBe('5 pts · fell');
    expect(resultText(ath('a', { resultStatus: 'DNS' }))).toBe('DNS');
    expect([1, 2, 3, 11, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '22nd']);
  });
  it('ranks points first, then time; falls keep points', () => {
    const list = [
      ath('slow-high', { resultStatus: 'Finished', resultPoints: 9, resultMs: 60000 }),
      ath('fast-low', { resultStatus: 'Finished', resultPoints: 7, resultMs: 30000 }),
      ath('fast-high', { resultStatus: 'Finished', resultPoints: 9, resultMs: 45000 }),
      ath('fell-9', { resultStatus: 'DNF', resultPoints: 9 }),
      ath('tie-a', { resultStatus: 'Finished', resultPoints: 7, resultMs: 30000 }),
      ath('dns', { resultStatus: 'DNS' }),
      ath('waiting', {}),
    ];
    const c = { athletes: list, levelById: new Map([['L', { id: 'L', name: 'L', advanceCount: 2, resultsFinal: true }]]) } as unknown as Ctx;
    const st = standings(c, 'L');
    expect(st.map(s => [s.a.name, s.rank])).toEqual([
      ['fast-high', 1], ['slow-high', 2], ['fell-9', 3], ['fast-low', 4], ['tie-a', 4], ['dns', null], ['waiting', null]]);
    expect(compareScore(list[0], list[2])).toBeGreaterThan(0);
  });
});
