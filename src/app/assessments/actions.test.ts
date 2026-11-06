import { beforeEach,describe,it,expect,vi } from 'vitest';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', qid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const m=vi.hoisted(()=>({attempt:vi.fn(),questions:vi.fn(),rpc:vi.fn(),userRpc:vi.fn(),redirect:vi.fn(),revalidate:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('@/lib/supabase/server',()=>({supabaseServer:async()=>({auth:{getUser:async()=>({data:{user:{id:'student'}}})},rpc:m.userRpc,from:()=>({select:()=>({eq:()=>({maybeSingle:m.attempt})})})})}));
vi.mock('@/lib/supabase/admin',()=>({supabaseAdmin:()=>({rpc:m.rpc,from:()=>({select:()=>({eq:()=>({order:m.questions})})})})}));
import { submitAttempt,saveResponse } from './actions';
function form(answers:unknown={[qid]:{text:'fresh answer'}}){const f=new FormData();f.set('attemptId',id);f.set('responses',JSON.stringify(answers));return f;}
beforeEach(()=>{
 vi.resetAllMocks();
 m.attempt.mockResolvedValue({data:{id,assessment_id:id,student_id:'student',status:'in_progress'},error:null});
 m.questions.mockResolvedValue({data:[{id:qid,kind:'short',points:2,assessment_answer_keys:{correct_text:'fresh answer'}}],error:null});
 m.rpc.mockResolvedValue({data:id,error:null});m.userRpc.mockResolvedValue({error:null});
});
describe('submission action persistence',()=>{
 it('grades the complete form snapshot and uses one atomic persistence RPC',async()=>{
  await submitAttempt(form());
  expect(m.rpc).toHaveBeenCalledOnce();
  expect(m.rpc).toHaveBeenCalledWith('submit_assessment_result',{p_attempt:id,p_actor:'student',p_results:[{question_id:qid,response:{text:'fresh answer'},points_awarded:2,is_correct:true}]});
  expect(m.redirect).toHaveBeenCalled();
 });
 it('surfaces transaction failure without redirecting or reporting success',async()=>{
  m.rpc.mockResolvedValue({error:{message:'gradebook unavailable'}});
  await expect(submitAttempt(form())).rejects.toThrow('gradebook unavailable');
  expect(m.redirect).not.toHaveBeenCalled();expect(m.revalidate).not.toHaveBeenCalled();
 });
 it.each(['read','empty','keys'])('fails closed when questions are unavailable: %s',async kind=>{
  m.questions.mockResolvedValue(kind==='read'?{error:{message:'offline'}}:kind==='empty'?{data:[]}:{data:[{id:qid,kind:'short',points:2,assessment_answer_keys:null}]});
  await expect(submitAttempt(form())).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('rejects foreign question IDs and malformed answer objects',async()=>{
  await expect(submitAttempt(form({[id]:{text:'other'}}))).rejects.toThrow('another assessment');
  await expect(submitAttempt(form({[qid]:{index:'0'}}))).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('does not hide attempt read or autosave failures',async()=>{
  m.attempt.mockResolvedValue({error:{message:'offline'}});
  await expect(submitAttempt(form())).rejects.toThrow('load the attempt');
  m.userRpc.mockResolvedValue({error:{message:'already submitted'}});
  await expect(saveResponse({attemptId:id,questionId:qid,response:{text:'late'}})).rejects.toThrow('already submitted');
 });
});
