import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
import {ReadingJourney} from './ReadingJourney';
it('keeps practice in this lesson and explanations hidden until requested',()=>{
 vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>fn());
 let tree!:ReactTestRenderer;
 act(()=>{tree=create(React.createElement(ReadingJourney,{title:'Biology',large:false,body:{sections:[{heading:'Idea',text:'Cells are the unit of life.'},{heading:'Your turn',text:'(1) Is fire alive? Answer: Fire has no cells. (2) Are dogs alive? Answer: Dogs are made of cells.'}]}}));});
 const click=(label:string)=>act(()=>tree.root.findAllByType('button').find(b=>b.children.join('')===label)!.props.onClick());
 expect(JSON.stringify(tree.toJSON())).not.toContain('Fire has no cells.');
 click('Practice');expect(JSON.stringify(tree.toJSON())).toContain('Is fire alive?');expect(tree.root.findAllByType('a')).toHaveLength(0);
 click('Reveal explanation');expect(JSON.stringify(tree.toJSON())).toContain('Fire has no cells.');
 click('Next step →');expect(JSON.stringify(tree.toJSON())).not.toContain('Dogs are made of cells.');
 click('Review');expect(JSON.stringify(tree.toJSON())).toContain('Cells are the unit of life.');
 act(()=>tree.unmount());vi.unstubAllGlobals();
});
it('checks selected answers without treating the response as an official grade',()=>{
 let tree!:ReactTestRenderer;
 act(()=>{tree=create(React.createElement(ReadingJourney,{title:'Check',large:false,body:{practice_questions:[{prompt:'Which is the control?',options:['Untreated group','Treated group'],answer:0,explanation:'Use the untreated comparison.'}]}}));});
 const button=()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Check answer')!;
 expect(button().props.disabled).toBe(true);
 act(()=>tree.root.findAllByType('input')[1].props.onChange());
 act(()=>button().props.onClick());
 expect(JSON.stringify(tree.toJSON())).toContain('Not quite');
 act(()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Try again')!.props.onClick());
 act(()=>tree.root.findAllByType('input')[0].props.onChange());act(()=>button().props.onClick());
 expect(JSON.stringify(tree.toJSON())).toContain('Correct — check the reasoning');
 act(()=>tree.unmount());
});
