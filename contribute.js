import { api, getConfig, randomActionId, setupAuth } from "./app-client.js";
import { initPublicLibrary } from "./library-section.js";

initPublicLibrary();

const promptFields = [
  ["targetLanguage","Target language","ko"],["baseLanguage","Base language","en"],["level","Learner level","beginner"],
  ["topic","Lesson topic","Everyday introductions"],["learningGoals","Learning goals","Introduce yourself naturally"],
  ["ideas","Your ideas",""],["grammarGoals","Grammar goals",""],["vocabularyGoals","Vocabulary goals",""],
  ["sentenceCount","Sentence count","10"],["annotationDepth","Annotation depth","balanced"],["sentenceStyle","Sentence style","natural and varied"],
  ["tone","Tone","warm and practical"],["difficultyProgression","Difficulty progression","gradual"],["regionalPreference","Regional preference","standard"],
  ["culturalContext","Cultural context",""],["specialConstraints","Special constraints",""],["sourceMaterial","Source material (only if licensed)",""],
  ["schemaVersion","Required schema version","1"]
];
const form = document.querySelector("[data-prompt-form]");
for (const [name,label,value] of promptFields) {
  const wrapper=document.createElement("label");wrapper.className="workspace-field";
  const span=document.createElement("span");span.textContent=label;
  const multiline=["learningGoals","ideas","grammarGoals","vocabularyGoals","culturalContext","specialConstraints","sourceMaterial"].includes(name);
  const input=document.createElement(multiline?"textarea":"input");input.name=name;input.value=value;
  wrapper.append(span,input);form.append(wrapper);
}

let validatedLesson=null; let draft=null; let sentenceIndex=0; const reviews=new Map(); let prompt=""; let generationSource="manual";
const conversionSource=new URLSearchParams(location.search).get("conversionSource");
const workspace=document.querySelector("[data-workspace]");
const reviewSection=document.querySelector("[data-review-section]");
const preflightSection=document.querySelector("[data-preflight-section]");
const importStatus=document.querySelector("[data-import-status]");
const submitStatus=document.querySelector("[data-submit-status]");
const submissionsSection=document.querySelector("[data-submissions-section]");
const stepper=document.querySelector("[data-stepper]");
const stepSections=[...document.querySelectorAll("[data-step]")];
let phase=1;

function setPhase(next){phase=next;for(const section of stepSections)section.hidden=Number(section.dataset.step)!==phase;for(const indicator of stepper.querySelectorAll("[data-step-indicator]")){const step=Number(indicator.dataset.stepIndicator);indicator.classList.toggle("active",step===phase);indicator.classList.toggle("complete",step<phase);if(step===phase)indicator.setAttribute("aria-current","step");else indicator.removeAttribute("aria-current");}}

setupAuth(async()=>{workspace.hidden=false;stepper.hidden=false;submissionsSection.hidden=false;setPhase(1);await Promise.all([loadDrafts(),loadSubmissions()]);});

document.querySelector("[data-build-prompt]").addEventListener("click",async()=>{
  setStatus(importStatus,"Building prompt…");
  try{const input=Object.fromEntries(new FormData(form));const result=await api("/api/contributor",{method:"POST",body:{action:"prompt",input}});prompt=result.prompt;document.querySelector("[data-prompt-output]").value=prompt;document.querySelector("[data-template-version]").textContent=result.templateVersion;setStatus(importStatus,"Prompt ready.",true);}catch(error){setStatus(importStatus,error.message);}
});
document.querySelector("[data-copy-prompt]").addEventListener("click",()=>copyPrompt());
document.querySelector("[data-open-chatgpt]").addEventListener("click",()=>copyAndOpen("chatgpt"));
document.querySelector("[data-open-claude]").addEventListener("click",()=>copyAndOpen("claude"));
document.querySelector("[data-validate]").addEventListener("click",()=>validateJson());
document.querySelector("[data-save-draft]").addEventListener("click",()=>saveDraft());
document.querySelector("[data-load-draft]").addEventListener("click",()=>loadSelectedDraft());
document.querySelector("[data-previous]").addEventListener("click",()=>move(-1));
document.querySelector("[data-next]").addEventListener("click",()=>move(1));
document.querySelector("[data-reviewed]").addEventListener("click",()=>mark("reviewed"));
document.querySelector("[data-needs-work]").addEventListener("click",()=>mark("needs_work"));
document.querySelector("[data-review-filter]").addEventListener("change",()=>renderSentence());
document.querySelector("[data-sentence-jump]").addEventListener("change",(event)=>{sentenceIndex=Number(event.target.value);renderSentence();});
document.querySelector("[data-submit]").addEventListener("click",()=>submit());
document.querySelector("[data-refresh-submissions]").addEventListener("click",()=>loadSubmissions());
document.querySelectorAll("[data-step-back]").forEach((button)=>button.addEventListener("click",()=>setPhase(Number(button.dataset.stepBack)-1)));
document.querySelectorAll("[data-step-next]").forEach((button)=>button.addEventListener("click",async()=>{const step=Number(button.dataset.stepNext);if(step===1){setPhase(2);return;}if(step===2){await saveDraft();return;}if(step===3){const total=validatedLesson?.sentences.length||0;const reviewed=[...reviews.values()].filter((status)=>status==="reviewed").length;if(!draft||reviewed!==total){setStatus(importStatus,"Review every sentence before continuing to submission.");return;}setPhase(4);}}));
window.addEventListener("keydown",(event)=>{if(event.target.matches("input,textarea,select"))return;if(event.key==="ArrowLeft"||event.key==="k")move(-1);if(event.key==="ArrowRight"||event.key==="j")move(1);if(event.key.toLowerCase()==="r")mark("reviewed");});

async function copyPrompt(){if(!prompt)throwStatus("Generate the prompt first.");try{await navigator.clipboard.writeText(prompt);setStatus(importStatus,"Prompt copied.",true);return true;}catch{setStatus(importStatus,"Clipboard access was denied. Select the prompt and copy it manually.");return false;}}
async function copyAndOpen(provider){if(!await copyPrompt())return;const config=await getConfig();const url=config.providerUrls?.[provider];if(!["https://chatgpt.com/","https://claude.ai/"].includes(url)){setStatus(importStatus,"The chatbot destination is not allowlisted.");return;}generationSource=provider;window.open(url,"_blank","noopener,noreferrer");}
async function validateJson(){setStatus(importStatus,"Validating…");try{const result=await api("/api/contributor",{method:"POST",body:{action:"validate",lesson:document.querySelector("[data-json-input]").value}});validatedLesson=result.lesson;document.querySelector("[data-json-input]").value=JSON.stringify(result.lesson,null,2);setStatus(importStatus,`Valid lesson · ${result.lesson.sentences.length} sentences · ${result.contentHash}`,true);return result;}catch(error){validatedLesson=null;setStatus(importStatus,error.message);return null;}}
async function saveDraft(){const result=validatedLesson?{lesson:validatedLesson}:await validateJson();if(!result)return;setStatus(importStatus,"Saving contributor draft…");try{const body={action:conversionSource?"convert_personal":"save_draft",lesson:validatedLesson,state:"reviewing",generationSource,promptTemplateVersion:document.querySelector("[data-template-version]").textContent,resetReview:true,...(conversionSource?{personalLessonId:conversionSource}:{})};if(draft){body.draftId=draft.id;body.expectedRevision=draft.revision;}const response=await api("/api/contributor",{method:"POST",body});draft=response.draft;reviews.clear();sentenceIndex=0;const jump=document.querySelector("[data-sentence-jump]");jump.replaceChildren(...validatedLesson.sentences.map((sentence,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=`${index+1}. ${sentence.text.slice(0,50)}`;return option;}));renderSentence();await refreshPreflight();setPhase(3);setStatus(importStatus,`${conversionSource?"Contributor copy created; the personal lesson remains unchanged.":"Contributor draft saved."} Revision ${draft.revision}; review progress is incomplete.`,true);}catch(error){setStatus(importStatus,error.message);}}
async function mark(status){if(!draft)return;try{await api("/api/contributor",{method:"POST",body:{action:"review_sentence",draftId:draft.id,sentenceIndex,status}});reviews.set(sentenceIndex,status);renderSentence();await refreshPreflight();if(status==="reviewed")move(1);}catch(error){setStatus(submitStatus,error.message);}}
function move(delta){if(!validatedLesson)return;const candidates=filteredIndexes();const current=candidates.indexOf(sentenceIndex);const next=candidates[Math.max(0,Math.min(candidates.length-1,current+delta))];if(next!==undefined){sentenceIndex=next;renderSentence();}}
function filteredIndexes(){if(!validatedLesson)return[];const filter=document.querySelector("[data-review-filter]").value;return validatedLesson.sentences.map((_,i)=>i).filter((i)=>filter==="all"||(filter==="incomplete"&&reviews.get(i)!=="reviewed")||reviews.get(i)===filter);}
function renderSentence(){if(!validatedLesson)return;const candidates=filteredIndexes();if(!candidates.includes(sentenceIndex))sentenceIndex=candidates[0]??0;document.querySelector("[data-sentence-jump]").value=String(sentenceIndex);const sentence=validatedLesson.sentences[sentenceIndex];const target=document.querySelector("[data-sentence-review]");target.replaceChildren();if(!sentence){target.textContent="No sentences match this filter.";return;}const card=document.createElement("article");card.className="sentence-review";const heading=document.createElement("div");heading.className="workspace-actions";heading.append(node("strong",`Sentence ${sentenceIndex+1} of ${validatedLesson.sentences.length}`),badge(reviews.get(sentenceIndex)||"unreviewed"));card.append(heading,node("p",sentence.text,"source"),node("p",sentence.translation));const dl=document.createElement("dl");appendDetail(dl,"Words",formatAnnotations(sentence.words));appendDetail(dl,"Grammar",formatAnnotations(sentence.grammar));appendDetail(dl,"Chunks",formatAnnotations(sentence.chunks));appendDetail(dl,"Metadata",sentence.metadata?JSON.stringify(sentence.metadata):"None");appendDetail(dl,"Notes",sentence.notes||"None");card.append(dl);target.append(card);renderProgress();}
function renderProgress(){const total=validatedLesson?.sentences.length||0;const reviewed=[...reviews.values()].filter((x)=>x==="reviewed").length;const pct=total?Math.round(reviewed/total*100):0;document.querySelector("[data-review-count]").textContent=`${reviewed}/${total} reviewed · ${pct}% · ${total-reviewed} remaining`;document.querySelector("[data-review-bar]").style.width=`${pct}%`;}
async function refreshPreflight(){if(!draft)return;try{const data=await api(`/api/contributor?action=preflight&id=${encodeURIComponent(draft.id)}`);const p=data.preflight;const target=document.querySelector("[data-preflight]");target.replaceChildren();const dl=document.createElement("dl");for(const [label,value] of [["Lesson",p.title],["Languages",`${p.targetLanguage} → ${p.baseLanguage}`],["Level",p.level],["Sentences",p.sentenceCount],["Schema",p.schemaVersion],["Prompt template",p.promptTemplateVersion||"manual"],["Generation source",p.generationSource],["Review",`${p.reviewed}/${p.total}`],["Revision",p.revision],["Content hash",p.contentHash],["Readiness",p.ready?"Ready to submit":"Incomplete"]])appendDetail(dl,label,value);target.append(dl);document.querySelector("[data-submit]").disabled=!p.ready;}catch(error){setStatus(submitStatus,error.message);}}
async function submit(){if(!draft||!document.querySelector("[data-confirm]").checked){setStatus(submitStatus,"Confirm that you reviewed the lesson before submitting.");return;}try{const response=await api("/api/contributor",{method:"POST",idempotencyKey:randomActionId("submit"),body:{action:"submit",draftId:draft.id,expectedRevision:draft.revision,confirmed:true}});setStatus(submitStatus,`Submitted immutable version ${response.submission.version}. Content hash: ${response.submission.contentHash}`,true);document.querySelector("[data-submit]").disabled=true;await loadSubmissions();}catch(error){setStatus(submitStatus,error.message);}}
async function loadDrafts(){try{const data=await api("/api/contributor?action=drafts");const select=document.querySelector("[data-saved-drafts]");select.replaceChildren(node("option","New contributor draft"));select.firstElementChild.value="";for(const item of data.drafts){const option=node("option",`${item.title} · revision ${item.revision} · ${item.state}`);option.value=item.id;select.append(option);}if(data.drafts[0])setStatus(importStatus,`You have ${data.drafts.length} saved contributor draft(s).`,true);}catch(error){setStatus(importStatus,error.message);}}
async function loadSelectedDraft(){const id=document.querySelector("[data-saved-drafts]").value;if(!id)return;try{const data=await api(`/api/contributor?action=draft&id=${encodeURIComponent(id)}`);draft=data.draft;validatedLesson=draft.canonical_json;reviews.clear();for(const review of draft.sentence_review_progress||[])reviews.set(review.sentence_index,review.status);document.querySelector("[data-json-input]").value=JSON.stringify(validatedLesson,null,2);const jump=document.querySelector("[data-sentence-jump]");jump.replaceChildren(...validatedLesson.sentences.map((sentence,index)=>{const option=node("option",`${index+1}. ${sentence.text.slice(0,50)}`);option.value=String(index);return option;}));sentenceIndex=0;renderSentence();await refreshPreflight();setPhase(3);setStatus(importStatus,`Resumed ${draft.title} at revision ${draft.revision}.`,true);}catch(error){setStatus(importStatus,error.message);}}
async function loadSubmissions(){const target=document.querySelector("[data-submissions]");try{const data=await api("/api/contributor?action=submissions");target.replaceChildren();for(const item of data.submissions){const card=document.createElement("article");card.className="sentence-review";card.append(node("strong",item.title),badge(item.state),node("p",`${item.target_language} → ${item.base_language} · version ${item.current_version} · ${new Date(item.updated_at).toLocaleString()}`));if(item.state==="submitted"){const button=node("button","Withdraw submission");button.className="button secondary";button.addEventListener("click",async()=>{if(!confirm("Withdraw this submitted version from review?"))return;try{await api("/api/contributor",{method:"POST",idempotencyKey:randomActionId("withdraw"),body:{action:"withdraw",submissionId:item.id}});await loadSubmissions();}catch(error){setStatus(submitStatus,error.message);}});card.append(button);}target.append(card);}if(!data.submissions.length)target.append(node("p","No submissions yet."));}catch(error){target.replaceChildren(node("p",error.message,"workspace-error"));}}
function appendDetail(dl,label,value){dl.append(node("dt",label),node("dd",value||"None"));}
function formatAnnotations(items){return items?.map((item)=>`${item.surface||item.pattern}: ${item.meaning||item.explanation||"annotated"}`).join("; ")||"None";}
function node(tag,value,className){const el=document.createElement(tag);el.textContent=String(value??"");if(className)el.className=className;return el;}
function badge(status){const el=node("span",status.replace("_"," "));el.className=`status-badge ${status}`;return el;}
function setStatus(element,message,success=false){element.textContent=message;element.className=success?"workspace-success":"workspace-error";}
function throwStatus(message){setStatus(importStatus,message);return false;}
