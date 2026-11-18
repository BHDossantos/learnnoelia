import {expect,it,vi} from "vitest";
import {allRows} from "./all-rows";
it("loads beyond the first page and stops at an empty final page",async()=>{
 const page=vi.fn().mockResolvedValueOnce({data:[1,2],error:null}).mockResolvedValueOnce({data:[3,4],error:null}).mockResolvedValueOnce({data:[],error:null});
 expect(await allRows(page,2)).toEqual([1,2,3,4]);
 expect(page.mock.calls).toEqual([[0,1],[2,3],[4,5]]);
});
it("does not present partial progress as complete when a page fails",async()=>{
 await expect(allRows(async()=>({data:null,error:{message:"offline"}}))).rejects.toThrow("Could not load");
});
