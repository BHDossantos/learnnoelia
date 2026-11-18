export function courseArt(title:string,school=''){
 const t=title.toLowerCase();
 const rules:[RegExp,number,string][]=[
  [/psych|neuro|cognit|mental/,1,'Sculptural brain illustration'],[/sociol|anthropol|social|civics|politic/,4,'People gathering in a public square'],
  [/anatom|physiolog|medicine|health|nurs/,5,'Decorative anatomical model'],[/chem|molecul|biochem/,2,'Laboratory glassware illustration'],
  [/astro|space|planet|cosmo/,11,'Ringed planet and stars illustration'],[/physic|optics|mechanic|electric/,3,'Prism and light illustration'],
  [/biolog|botan|ecolog|genetic|environment|agric|zoolog/,0,'Leaf with water droplets illustration'],
  [/math|algebra|calculus|geometr|statistic|probability/,6,'Geometric solids illustration'],
  [/coding|program|computer|python|javascript|software|cyber|\bsql\b|data science|technology/,7,'Computer and electronics illustration'],
  [/business|financ|account|econom|market|entrepren|management/,8,'City and business growth illustration'],
  [/art|music|paint|design|theater|film|photograph/,10,'Artist brushes and pigments illustration'],
 ];
 const match=rules.find(([pattern])=>pattern.test(t));
 const defaults:Record<string,number>={language:9,math:6,science:0,technology:7,business:8,humanities:4,arts:10};
 const index=match?.[1]??defaults[school]??9;
 return {index,alt:match?.[2]??'Decorative course illustration',column:index%4,row:Math.floor(index/4)};
}
