import {expect,it} from 'vitest';
import {demoDays,reportSummary} from './demo-student-report';
it('keeps attendance, completion and grades separate',()=>{
 expect(reportSummary()).toEqual({percent:75,completed:23,total:36,studyDays:7,noCompletionDays:3,present:8,absent:1,excused:1,missing:1});
 expect(demoDays.find(d=>d.date==='2026-11-12')).toMatchObject({attendance:'present',completed:0});
 expect(new Set(demoDays.map(d=>d.date)).size).toBe(10);
});
it('does not treat missing evidence as a zero grade',()=>{expect(reportSummary([],[]).percent).toBeNull();});
