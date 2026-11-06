import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),reconcile:vi.fn(),close:vi.fn()}));
vi.mock('@/lib/tutor-settlement',()=>({tutorAdmin:()=>({from:m.from,rpc:m.rpc}),reconcileTutorSettlement:m.reconcile}));
vi.mock('@/lib/livekit',()=>({livekitRoomService:()=>({deleteRoom:m.close})}));
import { POST } from './route';
function query(result:unknown) {
 const target:any={};
 const proxy:any=new Proxy(target,{get:(_,key)=>key==='then' ? (resolve:any)=>Promise.resolve(result).then(resolve) : ()=>proxy});
 return proxy;
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','test-only');m.rpc.mockResolvedValue({data:{},error:null});m.close.mockResolvedValue({});m.reconcile.mockResolvedValue({state:'review_required'});});
afterEach(()=>vi.unstubAllEnvs());
describe('manual reconciliation recovery',()=>{
 it('rejects missing operator authorization before database/provider access',async()=>{
  expect((await POST(new Request('http://localhost/reconcile',{method:'POST'}))).status).toBe(401);
  expect(m.from).not.toHaveBeenCalled();
 });
 it('freezes abandoned calls, retries room cleanup, then checks held receipts',async()=>{
  m.from.mockReturnValueOnce(query({data:[{id:'s',student_id:'u'}],error:null}))
   .mockReturnValueOnce(query({data:[{session_id:'s',stripe_payment_intent:'pi_1'}],error:null}))
   .mockReturnValueOnce(query({error:null}))
   .mockReturnValueOnce(query({data:{id:'s',student_id:'u',livekit_room:'room'},error:null}));
  const response=await POST(new Request('http://localhost/reconcile',{method:'POST',headers:{authorization:'Bearer test-only'}}));
  expect(await response.json()).toEqual({checked:1,pending:0});
  expect(m.rpc).toHaveBeenCalledWith('begin_tutor_settlement',{p_session:'s',p_actor:'u'});
  expect(m.close).toHaveBeenCalledWith('room');
  expect(m.reconcile).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({stripe_payment_intent:'pi_1'}));
 });
});
