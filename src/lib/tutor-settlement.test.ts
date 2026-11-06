import { beforeEach,describe,it,expect,vi } from 'vitest';
const retrieve=vi.hoisted(()=>vi.fn());
vi.mock('./stripe',()=>({getStripe:()=>({paymentIntents:{retrieve}})}));
import { reconcileTutorSettlement } from './tutor-settlement';
const s={id:'session',student_id:'student',tutor_id:'tutor',stripe_payment_intent:'pi_1',max_budget_cents:1000};
const rpc=vi.fn();const db={rpc} as any;
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:{state:'captured'},error:null});retrieve.mockResolvedValue({id:'pi_1',status:'succeeded',currency:'usd',amount_received:200,metadata:{session_id:'session',student_id:'student',tutor_id:'tutor'}});});
describe('provider reconciliation persistence',()=>{
 it('does not turn a provider timeout into a captured row',async()=>{retrieve.mockRejectedValue(new Error('timeout'));await expect(reconcileTutorSettlement(db,s)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('propagates persistence failure so a later attempt can reconcile again',async()=>{rpc.mockResolvedValueOnce({data:null,error:{message:'db down'}});await expect(reconcileTutorSettlement(db,s)).rejects.toThrow();await reconcileTutorSettlement(db,s);expect(retrieve).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[1][1].p_amount).toBe(200);});
 it('holds legacy intents without a session binding for review',async()=>{retrieve.mockResolvedValue({...await retrieve(),metadata:{student_id:'student',tutor_id:'tutor'}});await reconcileTutorSettlement(db,s);expect(rpc.mock.calls[0][1]).toEqual({p_session:'session',p_state:'review_required',p_amount:0});});
});
