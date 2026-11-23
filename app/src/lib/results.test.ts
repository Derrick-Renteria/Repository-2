import { describe, it, expect } from 'vitest';
import { fmtResult, parseResult, ordinal } from './results';
describe('results', () => {
  it('parses times', () => {
    expect(parseResult('42.31')).toBe(42310);
    expect(parseResult('42')).toBe(42000);
    expect(parseResult('1:05.40')).toBe(65400);
    expect(parseResult('1:05.4')).toBe(65400);
    expect(parseResult('1.05.40')).toBe(65400);
    expect(parseResult('105.4')).toBe(105400);
    expect(parseResult('1:05')).toBe(65000);
    expect(parseResult('abc')).toBeNull();
  });
  it('formats times', () => {
    expect(fmtResult(42310)).toBe('42.31');
    expect(fmtResult(65400)).toBe('1:05.40');
    expect(fmtResult(5000)).toBe('5.00');
  });
  it('ordinals', () => { expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']); });
});
