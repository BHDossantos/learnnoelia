import {readingChoices} from './reading-choices';
import {authoredPractice,promptKey} from './authored-practice';
export type ReadingStep = { title: string; section: string; kind: 'read' | 'example' | 'practice'; text: string; answer?: string; options?: string[]; correct?: number };

function numbered(text: string): {intro: string; items: string[]} | null {
  const matches = [...text.matchAll(/(?:^|\s)(?:\((\d+)\)|(\d+)\))\s*/g)];
  if (matches.length < 2 || matches.some((m,i)=>Number(m[1]??m[2]) !== i+1)) return null;
  return {intro:text.slice(0,matches[0].index).trim(),items:matches.map((m,i)=>text.slice(m.index!+m[0].length,matches[i+1]?.index??text.length).trim())};
}
function chunks(text: string) {
  // Keep sentences intact, including decimals/abbreviations; only change layout.
  const sentences = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)].map(s=>s.segment) : [text];
  const result:string[]=[]; let chunk='';
  for(const sentence of sentences){
    if(chunk && (chunk+sentence).split(/\s+/).length>110){result.push(chunk.trim());chunk='';}
    chunk+=sentence;
  }
  if(chunk.trim())result.push(chunk.trim());
  return result.length?result:[text];
}
export function readingSteps(body: any): ReadingStep[] {
  const sections: {heading:string;text:string}[]=[];
  if(typeof body?.content==='string' && body.content.trim())sections.push({heading:'Explore the idea',text:body.content});
  if(Array.isArray(body?.sections)) for(const s of body.sections) if(s && typeof s.text==='string' && s.text.trim()) sections.push({heading:typeof s.heading==='string'?s.heading:'Explore the idea',text:s.text});
  const steps:ReadingStep[]=[];
  for(const section of sections){
    const add=(text:string,kind:ReadingStep['kind']='read',answer?:string,title=section.heading)=>{if(text.trim())steps.push({title,section:section.heading,kind,text:text.trim(),...(answer?{answer:answer.trim()}:{})});};
    const answerKey=/\b(?:Sample\s+)?Answers?\s*:/i.exec(section.text);
    const inline=numbered(section.text);
    if(inline && inline.items.every(item=>/\bAnswer\s*:/i.test(item))){
      if(inline.intro)add(inline.intro);
      inline.items.forEach((item,i)=>{const m=/\bAnswer\s*:/i.exec(item)!;add(item.slice(0,m.index),'practice',item.slice(m.index+m[0].length),`Try it · ${i+1}`);});
    }else if(answerKey){
      const questions=section.text.slice(0,answerKey.index).trim();
      const answers=section.text.slice(answerKey.index+answerKey[0].length).trim();
      const qs=numbered(questions), as=numbered(answers);
      if(qs && as && qs.items.length===as.items.length && !as.intro){
        if(qs.intro)add(qs.intro);
        qs.items.forEach((q,i)=>add(q,'practice',as.items[i],`Try it · ${i+1}`));
      }else add(questions,'practice',answers,section.heading);    }else {
      // Unknown formats stay readable; never invent questions, answers or scores.
      const cases=section.text.split(/(?=\bCase\s+\d+\s*[—–:-])/);
      const kind=/worked|example|case/i.test(section.heading)?'example':'read';
      for(const part of cases) for(const chunk of chunks(part))add(chunk,kind);
    }
  }
  for(const step of steps){const choice=readingChoices(step.text);if(step.answer&&choice)Object.assign(step,choice);}
  for(const q of authoredPractice(body)){
    const existing=steps.find(step=>step.kind==='practice'&&promptKey(step.text)===promptKey(q.prompt));
    const choice={options:q.options,correct:q.answer,answer:q.explanation};
    if(existing) Object.assign(existing,choice);
    else steps.push({title:'Check your understanding',section:'Your turn',kind:'practice',text:q.prompt,...choice});
  }
  return steps;
}

export function studySheet(title:string,body:any,includeAnswers=false){
 const steps=readingSteps(body);
 const lines=[`# ${title}`,includeAnswers?'Study sheet with explanations':'Study sheet — try the questions before checking the explanations',''];
 for(const step of steps){lines.push(`## ${step.section}`,step.text,'');if(step.options)lines.push(...step.options.map((option,i)=>`${String.fromCharCode(65+i)}. ${option}`),'');if(step.answer)lines.push(includeAnswers?`${step.options?`Correct answer: ${step.options[step.correct!]}\n`:''}Explanation: ${step.answer}`:'Your response: ______________________________','');}
 if(Array.isArray(body?.key_terms))for(const term of body.key_terms)if(typeof term?.term==='string'&&typeof term.definition==='string')lines.push(`- ${term.term}: ${includeAnswers?term.definition:'______________________________'}`);
 return lines.join('\n');
}
