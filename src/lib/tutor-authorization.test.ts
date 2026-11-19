import {describe,it,expect,vi,afterEach} from 'vitest';
import {hasTutorAuthorization} from './tutor-authorization';
const mocks=vi.hoisted(()=>({retrieve:vi.fn()}));
vi.mock('./stripe',()=>({getStripe:()=>({paymentIntents:{retrieve:mocks.retrieve}})}));
import {canJoinTutorRoom} from './tutor-room-access';
const session={id:'session',student_id:'student',tutor_id:'tutor',status:'live',stripe_payment_intent:'pi_1',max_budget_cents:1500,tutor_accepted_at:'2026-11-18T10:00:00Z'};
const payment={id:'pi_1',status:'requires_capture',capture_method:'manual',currency:'usd',amount:1500,amount_capturable:1500,livemode:false,metadata:{session_id:'session',student_id:'student',tutor_id:'tutor'}};
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
describe('tutor room authorization',()=>{
 it('accepts only the exact held budget after tutor acceptance',()=>expect(hasTutorAuthorization(session,payment,false)).toBe(true));
 it.each(['requires_payment_method','requires_confirmation','requires_action','processing','canceled','succeeded'])('rejects %s',status=>expect(hasTutorAuthorization(session,{...payment,status},false)).toBe(false));
 it.each(['session_id','student_id','tutor_id'])('rejects mismatched %s',key=>expect(hasTutorAuthorization(session,{...payment,metadata:{...payment.metadata,[key]:'other'}},false)).toBe(false));
 it.each([{amount_capturable:1499},{amount:1501},{currency:'eur'},{capture_method:'automatic'},{id:'pi_other'},{livemode:true}])('rejects an incorrect provider binding %j',patch=>expect(hasTutorAuthorization(session,{...payment,...patch},false)).toBe(false));
 it.each([{status:'ended'},{tutor_accepted_at:null},{tutor_accepted_at:'bad'},{max_budget_cents:0},{max_budget_cents:null},{max_budget_cents:1.5}])('rejects an invalid session %j',patch=>expect(hasTutorAuthorization({...session,...patch},payment,false)).toBe(false));
 it('does not call Stripe without configuration or tutor acceptance',async()=>{
  vi.stubEnv('STRIPE_SECRET_KEY','');expect(await canJoinTutorRoom(session)).toBe(false);
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fake');expect(await canJoinTutorRoom({...session,tutor_accepted_at:null})).toBe(false);
  expect(mocks.retrieve).not.toHaveBeenCalled();
 });
 it('fails closed on network errors and accepts a verified test hold',async()=>{
  vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fake');mocks.retrieve.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(payment);
  expect(await canJoinTutorRoom(session)).toBe(false);expect(await canJoinTutorRoom(session)).toBe(true);
 });
});
