import React from "react";
import {act,create,type ReactTestRenderer} from "react-test-renderer";
import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({complete:vi.fn()}));
vi.mock("@/app/learn/[courseId]/[lessonId]/actions",()=>({completeLessonAction:mocks.complete,rateCardAction:vi.fn(),logQuizAnswer:vi.fn(),recordTestResultAction:vi.fn()}));
vi.mock("next/link",()=>({default:({children,...props}:any)=>React.createElement("a",props,children)}));
import {ContentLesson} from "../LessonPlayer";
it("keeps content available after a save failure and reports completion only on success",async()=>{
 mocks.complete.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(undefined);
 let tree!:ReactTestRenderer;
 act(()=>{tree=create(React.createElement(ContentLesson,{body:{sections:[{heading:"Basics",text:"Read me"},{heading:"Practice",text:"Try it"}]},title:"Lesson",courseId:"c",lessonId:"l",grammar:null}));});
 const complete=()=>tree.root.findAllByType("button").find(b=>b.children.includes("Mark complete"))!;
 await act(async()=>{await complete().props.onClick();});
 expect(tree.root.findByProps({role:"alert"}).children.join("")).toContain("could not be saved");
 expect(JSON.stringify(tree.toJSON())).not.toContain("Progress saved.");
 await act(async()=>{await complete().props.onClick();});
 expect(JSON.stringify(tree.toJSON())).toContain("Progress saved.");
 act(()=>tree.unmount());
});
