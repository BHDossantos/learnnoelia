import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),single:vi.fn(),rpc:vi.fn(),reconcile:vi.fn(),close:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({supabaseServer:async()=>({auth:{getUser:mocks.auth},from:()=>({select:()=>({eq:()=>({single:mocks.single})})})})}));
vi.mock('@/lib/tutor-settlement',()=>({tutorAdmin:()=>({rpc:mocks.rpc}),reconcileTutorSettlement:mocks.reconcile}));
vi.mock('@/lib/livekit',()=>({livekitRoomService:()=>({deleteRoom:mocks.close})}));
import { POST } from './route';
import { POST as start } from '../start/route';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session={id,student_id:'student',tutor_id:'tutor',stripe_payment_intent:'pi_1',livekit_room:'room',status:'live'};
const req=()=>new Request('http://localhost/end',{method:'POST',body:JSON.stringify({sessionId:id})});
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({data:{user:{id:'student'}}});mocks.single.mockResolvedValue({data:session,error:null});mocks.rpc.mockResolvedValue({data:{stripe_payment_intent:'pi_1'},error:null});mocks.close.mockResolvedValue({});mocks.reconcile.mockResolvedValue({state:'captured',amount_cents:350});});
describe('end session API',()=>{
 it('records confirmed outcome only after durable freeze',async()=>{
   mocks.reconcile.mockImplementation(async()=>{expect(mocks.rpc).toHaveBeenCalledOnce();return {state:'captured',amount_cents:350};});
   expect(await (await POST(req())).json()).toEqual({ended:true,paymentStatus:'captured',cents:350,roomClosed:true});
 });
 it('returns pending after provider failure, never captured or a fabricated amount',async()=>{
   mocks.reconcile.mockRejectedValue(new Error('timeout'));
   const response=await POST(req());expect(response.status).toBe(202);
   expect(await response.json()).toEqual({ended:true,paymentStatus:'pending',cents:null,roomClosed:true});
 });
 it('does not perform provider work if saving the end fails',async()=>{
   mocks.rpc.mockResolvedValue({data:null,error:{message:'db down'}});
   const response=await POST(req());expect(response.status).toBe(503);expect(mocks.reconcile).not.toHaveBeenCalled();expect(mocks.close).not.toHaveBeenCalled();
 });
 it('reconciles repeated end even when session is already ended',async()=>{
   mocks.single.mockResolvedValue({data:{...session,status:'ended'},error:null});
   await POST(req());expect(mocks.reconcile).toHaveBeenCalledOnce();
 });
 it('reports an unclosed room independently from the payment result',async()=>{
   mocks.close.mockRejectedValue(new Error('provider down'));
   expect((await (await POST(req())).json()).roomClosed).toBe(false);
 });
 it('does not imply no charge when review is required',async()=>{
   mocks.reconcile.mockResolvedValue({state:'review_required',amount_cents:0});
   expect((await (await POST(req())).json()).cents).toBeNull();
 });
 it('rejects nonparticipants before using service credentials',async()=>{
   mocks.auth.mockResolvedValue({data:{user:{id:'stranger'}}});
   expect((await POST(req())).status).toBe(404);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('rejects malformed JSON',async()=>{expect((await POST(new Request('http://localhost/end',{method:'POST',body:'broken'}))).status).toBe(400);});
 it('blocks new paid sessions before any provider operation',async()=>{expect((await start()).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();});
});
