import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect,it,vi } from "vitest";
vi.mock("next/link",()=>({default:({children,...props}:any)=>React.createElement("a",props,children)}));
import { TopicExplorer } from "./TopicExplorer";
import { TopicCatalog } from "./TopicCatalog";
it("filters lessons and clears an empty result without hiding completion evidence",()=>{
 let tree!:ReactTestRenderer;
 act(()=>{tree=create(React.createElement(TopicExplorer,{courseId:"course",nextId:"b",lessons:[{id:"a",title:"Fractions",kind:"reading",completed:true,mastery:"Review needed",estimated_minutes:5},{id:"b",title:"Decimals",kind:"quiz",completed:false,mastery:null,estimated_minutes:10}]}));});
 const button=(text:string)=>tree.root.findAllByType("button").find(b=>b.children.includes(text))!;
 act(()=>button("Needs practice").props.onClick());
 expect(tree.root.findAllByType("a").filter(a=>a.props.href.endsWith("/a"))).toHaveLength(1);
 act(()=>tree.root.findByType("input").props.onChange({target:{value:"nonexistent"}}));
 expect(JSON.stringify(tree.toJSON())).toContain("No lessons match yet");
 act(()=>button("Clear filters").props.onClick());
 expect(tree.root.findByProps({role:"status"}).children.join("")).toBe("2 of 2 lessons");
 act(()=>tree.unmount());
});
it("offers real resume links and filters completed topics",()=>{
 let tree!:ReactTestRenderer;
 act(()=>{tree=create(React.createElement(TopicCatalog,{icon:"➗",topics:[{id:"c",title:"Math",description:"Numbers",cefr_level:null,goal_tag:null,total:2,done:1,minutes:10,nextId:"lesson"}]}));});
 expect(tree.root.findAllByType("a").some(a=>a.props.href==="/learn/c/lesson")).toBe(true);
 act(()=>tree.root.findAllByType("select")[0].props.onChange({target:{value:"complete"}}));
 expect(JSON.stringify(tree.toJSON())).toContain("No topics match");
 act(()=>tree.unmount());
});
