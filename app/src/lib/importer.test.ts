import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { analyze, parseTable, sheetCsvUrl } from './importer';
import { parseTime, fmt } from './time';

describe('time', () => {
  it('parses and formats', () => {
    expect(parseTime('9:00:00 AM')).toBe(540);
    expect(parseTime('12:15 PM')).toBe(735);
    expect(parseTime('12:00 AM')).toBe(0);
    expect(parseTime('13:30')).toBe(810);
    expect(parseTime('930am')).toBe(570);
    expect(parseTime('nope')).toBeNull();
    expect(fmt(810)).toBe('1:30 PM');
  });
});
describe('sheet link', () => {
  it('unwraps safelinks', () => {
    const l = 'https://nam09.safelinks.protection.outlook.com/?url=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2FABC_123%2Fedit%3Fusp%3Dsharing&data=x';
    expect(sheetCsvUrl(l)).toBe('https://docs.google.com/spreadsheets/d/ABC_123/export?format=csv&gid=0');
  });
});
describe('analyze', () => {
  it('handles a small sheet', () => {
    const csv = `#,Student,Class/Event/Appointment,,Age,Time
1,Ann A,Ninja 1 ,flight 1,5,9:00:00 AM
2,Bob B,Ninja 1 , flight 1,6,9:00 AM
3,Cy C,Ninja 1,flight 1,6,9:15 AM
4,Ann A,Ninja 1,flight 2,5,
,,,,,1 hr break`;
    const r = analyze(parseTable(csv));
    expect(r.levels).toEqual(['Ninja 1']);
    expect(r.flights.map(f => [f.number, f.startMin])).toEqual([[1, 540], [2, null]]);
    expect(r.athletes.find(a => a.name === 'Cy C')!.overrideMin).toBe(555);
    expect(r.issues.filter(i => i.type === 'Duplicate athlete')).toHaveLength(2);
  });
  const real = process.env.SHEET_CSV;
  it.runIf(!!real && existsSync(real!))('matches the real competition sheet', () => {
    const r = analyze(parseTable(readFileSync(real!, 'utf8')));
    expect(r.athletes).toHaveLength(286);
    expect(r.flights).toHaveLength(29);
    expect(r.levels).toEqual(['Ninjanators', 'Ninja 1', 'Ninja 2', 'Ninja 3', 'Ninja Team']);
    expect(r.athletes.filter(a => a.status === 'Pending')).toHaveLength(13);
  });
});
