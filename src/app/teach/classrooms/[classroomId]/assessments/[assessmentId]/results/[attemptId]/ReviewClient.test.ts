import React from 'react';
import { act,create,type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),publish:vi.fn(),suggest:vi.fn()}));
vi.mock('../../../actions',()=>({setWrittenScore:m.save,publishAttempt:m.publish,aiGradeWritten:m.suggest}));
import { ReviewClient } from './ReviewClient';
let tree:ReactTestRenderer;
const item={id:'question',kind:'written' as const,prompt:'Explain',points:2,answerText:'Answer',correctText:'Rubric',pointsAwarded:1,isCorrect:false,feedback:''};
function render(points:number|null=1) { act(()=>{tree=create(React.createElement(ReviewClient,{classroomId:'class',assessmentId:'assessment',attemptId:'attempt',items:[{...item,pointsAwarded:points}],published:false}));}); }
function button(label:string) { return tree.root.findAllByType('button').find(b=>b.children.includes(label))!; }
function edit() { act(()=>{tree.root.findAllByType('input').find(i => i.props.type === 'number')!.props.onChange({target:{value:'2'}});}); }
function deferred(){let resolve!:(value?:unknown)=>void, reject!:(reason:Error)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
beforeEach(()=>{vi.resetAllMocks();});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
it('blocks publication while an edited score is unsaved or its save is in flight',async()=>{
 const pending=deferred();m.save.mockReturnValue(pending.promise);render();
 expect(button('Publish results').props.disabled).toBe(false);edit();
 expect(button('Publish results').props.disabled).toBe(true);
 act(()=>{void button('Save score').props.onClick();});
 expect(tree.root.findByType('fieldset').props.disabled).toBe(true);
 expect(button('Publish results').props.disabled).toBe(true);
 await act(async()=>{pending.resolve();await pending.promise;});
 expect(button('Publish results').props.disabled).toBe(false);
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({points:2}));
});
it('keeps publication blocked when saving fails',async()=>{
 const pending=deferred();m.save.mockReturnValue(pending.promise);render();edit();
 act(()=>{void button('Save score').props.onClick();});
 await act(async()=>{pending.reject(new Error('offline'));await pending.promise.catch(()=>{});});
 expect(button('Publish results').props.disabled).toBe(true);
 expect(tree.root.findByType('fieldset').props.disabled).toBe(false);
});
it('requires an explicit score for a previously ungraded answer',()=>{
 render(null);expect(button('Publish results').props.disabled).toBe(true);
});
it('locks score editing for the entire publication request',async()=>{
 const pending=deferred();m.publish.mockReturnValue(pending.promise);render();
 act(()=>{void tree.root.findByType('form').props.action(new FormData());});
 expect(tree.root.findByType('fieldset').props.disabled).toBe(true);
 expect(button('Publish results').props.disabled).toBe(true);
 await act(async()=>{pending.resolve();await pending.promise;});
 expect(m.publish).toHaveBeenCalledOnce();
});
