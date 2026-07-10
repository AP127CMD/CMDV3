import { describe, expect, it } from 'vitest';
import { hmToMin, isSimLesson, lessonPhase, normLesson, PHASE_OTHER } from './lessons';

describe('normLesson', () => {
  it('drops trailing /n repeat markers and collapses spaces', () => {
    expect(normLesson('CDGL 04/1')).toBe('CDGL 04');
    expect(normLesson('cdgl  04')).toBe('CDGL 04');
    expect(normLesson('CDGL 04/2 ')).toBe('CDGL 04');
    expect(normLesson(null)).toBe('');
  });
  it('does not touch non-suffix slashes', () => {
    expect(normLesson('TCAR / LPC')).toBe('TCAR / LPC');
  });
});

describe('hmToMin', () => {
  it('parses H:MM and HH:MM', () => {
    expect(hmToMin('1:30')).toBe(90);
    expect(hmToMin('01:05')).toBe(65);
    expect(hmToMin(null)).toBeNull();
    expect(hmToMin('—')).toBeNull();
  });
});

describe('isSimLesson', () => {
  it('detects (SIM) markers', () => {
    expect(isSimLesson('CDIF(SIM) 56')).toBe(true);
    expect(isSimLesson('CMDIF(SIM) 91')).toBe(true);
    expect(isSimLesson('CDGL 04')).toBe(false);
  });
});

describe('lessonPhase', () => {
  it('classifies phases with CDGL before GL', () => {
    expect(lessonPhase('CDGL 04').k).toBe('CDGL');
    expect(lessonPhase('GL 12').k).toBe('GL');
    expect(lessonPhase('IF 03').k).toBe('IF');
    expect(lessonPhase('IL 01').k).toBe('IF');
    expect(lessonPhase('XV 02').k).toBe('XV');
    expect(lessonPhase('NL 01').k).toBe('NL');
    expect(lessonPhase('SP 05').k).toBe('SP');
    expect(lessonPhase('PIC 01').k).toBe('SP');
    expect(lessonPhase('M 01').k).toBe('M');
    expect(lessonPhase('ZZZ')).toBe(PHASE_OTHER);
    expect(lessonPhase(null)).toBe(PHASE_OTHER);
  });
});
