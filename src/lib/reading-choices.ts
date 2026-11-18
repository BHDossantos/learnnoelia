// Authored alternatives for existing biology prompts, keyed by the exact prompt.
// Unmatched written exercises remain written; no unrelated distractors are generated.
const choices:Record<string,{options:string[];correct:number}>={
 'Which life property lets a plant bend toward a window?':{options:['Reproduction','Responding to the environment','Evolution across generations','Being made of several cells'],correct:1},
 'You test whether sugar water keeps cut flowers fresh longer; what is the control group?':{options:['Identical flowers in plain water with no sugar','Flowers given twice as much sugar','A different flower species in sugar water','Flowers kept without any water'],correct:0},
 'True or false: a scientific theory is just a guess.':{options:['True — a theory is an untested opinion','False — a scientific theory is a broad explanation supported by evidence'],correct:1},
 'Name the step that comes right after forming a hypothesis.':{options:['Declare the hypothesis proven','Publish the conclusion without collecting evidence','Make a prediction and design an experiment','Change every experimental condition at once'],correct:2},
 'A candle flame grows and uses energy; give one reason it is not alive.':{options:['It responds to moving air','It releases heat','It changes size over time','It is not made of cells'],correct:3},
 'Rewrite as a testable hypothesis: I think loud music bothers plants.':{options:['Plants dislike all music','Tomato plants exposed to loud music for four hours daily will grow shorter than identical plants kept quiet','Music is bad for nature','Quiet plants are happier'],correct:1},
};
export function readingChoices(prompt:string){return choices[prompt.trim()];}
