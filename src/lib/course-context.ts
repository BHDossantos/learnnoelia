export function courseFromPath(path:string){
 const id=path.match(/^\/(?:learn|assessments\/course)\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
 return id??null;
}
