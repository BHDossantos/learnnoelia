import { describe, it, expect } from 'vitest';
import { classifyTutorReceipt, type TutorBinding, type TutorReceipt } from './tutor-receipt';
const session: TutorBinding = { id:'session',student_id:'student',tutor_id:'tutor',max_budget_cents:1000,stripe_payment_intent:'pi_1' };
const receipt: TutorReceipt = { id:'pi_1',status:'succeeded',amount_received:700,currency:'usd',metadata:{session_id:'session',student_id:'student',tutor_id:'tutor'} };
describe('authoritative tutor receipts', () => {
  it('records actual received amount, not estimated minutes or budget', () => {
    expect(classifyTutorReceipt(session,receipt)).toEqual({state:'captured',amount:700});
  });
  it.each(['requires_capture','requires_payment_method','processing','requires_action'])('holds %s without claiming capture',status=>{
    expect(classifyTutorReceipt(session,{...receipt,status})).toEqual({state:'review_required',amount:0});
  });
  it.each([
    {...receipt,id:'pi_other'}, {...receipt,currency:'eur'}, {...receipt,amount_received:1001},
    {...receipt,amount_received:-1}, {...receipt,amount_received:1.5},
    {...receipt,metadata:{student_id:'student',tutor_id:'tutor'}},
    {...receipt,metadata:{...receipt.metadata,student_id:'other'}},
  ])('does not account unbound or invalid receipts',r=>{
    expect(classifyTutorReceipt(session,r).state).toBe('review_required');
  });
  it('reports confirmed cancellation without a payment',()=>{
    expect(classifyTutorReceipt(session,{...receipt,status:'canceled'})).toEqual({state:'cancelled',amount:0});
  });
});
