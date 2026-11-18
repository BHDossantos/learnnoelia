import {beforeEach,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({user:vi.fn(),upsert:vi.fn(),rpc:vi.fn(),mastery:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({supabaseServer:async()=>({auth:{getUser:mock.user},from:(table:string)=>table==="lessons"?{select:()=>({eq:()=>({single:async()=>({data:{course_id:"c"}})})})}:{upsert:mock.upsert},rpc:mock.rpc})}));
vi.mock("@/lib/mastery",()=>({recordMasteryEvent:mock.mastery}));
import {completeLessonAction} from "./actions";
beforeEach(()=>{vi.resetAllMocks();mock.user.mockResolvedValue({data:{user:{id:"u"}}});mock.upsert.mockResolvedValue({error:null});mock.rpc.mockResolvedValue({data:[]});});
it("rejects expired sessions instead of reporting a saved lesson",async()=>{
 mock.user.mockResolvedValue({data:{user:null}});
 await expect(completeLessonAction("l",100)).rejects.toThrow("Sign in");
 expect(mock.upsert).not.toHaveBeenCalled();
});
it("does not award mastery or XP after persistence fails",async()=>{
 mock.upsert.mockResolvedValue({error:{message:"database unavailable"}});
 await expect(completeLessonAction("l",100)).rejects.toThrow("Could not save");
 expect(mock.mastery).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it("continues existing mastery and XP flow only after progress saves",async()=>{
 await completeLessonAction("l",100);
 expect(mock.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:"u",lesson_id:"l",score:100}));
 expect(mock.mastery).toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledWith("award_xp",expect.anything());
});
