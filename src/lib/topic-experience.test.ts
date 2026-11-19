import { describe, expect, it } from "vitest";
import { filterTopicLessons, shortSession, topicUnits, type TopicLesson } from "./topic-experience";
const lesson=(id:string,over:Partial<TopicLesson>={}):TopicLesson=>({id,title:id,kind:"reading",completed:false,mastery:null,estimated_minutes:5,...over});
describe("topic navigation and study planning",()=>{
 it("keeps diagnostic separate and ends units at checkpoints",()=>expect(topicUnits([lesson("d",{kind:"quiz"}),lesson("a"),lesson("q",{kind:"quiz"}),lesson("b")]).map(u=>[u.title,u.lessons.length])).toEqual([["Optional diagnostic",1],["Unit 1",2],["Unit 2",1]]));
 it("combines search, review state and duration without treating completion as mastery",()=>{
  const rows=[lesson("Algebra",{completed:true,mastery:"Review needed"}),lesson("Geometry",{completed:true,mastery:"Mastered"}),lesson("unknown",{estimated_minutes:null})];
  expect(filterTopicLessons(rows," ALG ","review",10).map(l=>l.id)).toEqual(["Algebra"]);
  expect(filterTopicLessons(rows,"unknown","all",10)).toEqual([]);
 });
 it("builds a bounded ordered plan, skips diagnostic, and excludes completed lessons",()=>{
  expect(shortSession([lesson("d",{kind:"quiz"}),lesson("done",{completed:true}),lesson("a"),lesson("b"),lesson("c")],10).map(l=>l.id)).toEqual(["a","b"]);
 });
 it("never skips a prerequisite just to fit the budget or invents unknown durations",()=>{
  expect(shortSession([lesson("long",{estimated_minutes:30}),lesson("short")],10)).toEqual([]);
  expect(shortSession([lesson("unknown",{estimated_minutes:null})],30)).toEqual([]);
  expect(topicUnits([])).toEqual([]);
 });
});
