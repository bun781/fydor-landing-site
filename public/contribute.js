import { api, getConfig, randomActionId, setupAuth } from "./app-client.js";
import { renderPackPreview } from "./pack-preview.js";

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
  if (multiline) wrapper.classList.add("field-wide");
  const input=document.createElement(multiline?"textarea":"input");input.name=name;input.value=value;
  wrapper.append(span,input);form.append(wrapper);
}

let validatedPack=null; let draft=null; let sentenceIndex=0; const reviews=new Map(); let prompt=""; let generationSource="manual"; let creationMethod="ai"; let draftSavePending=false;
const conversionSource=new URLSearchParams(location.search).get("conversionSource");
const contributorEntry=document.querySelector("[data-contributor-entry]");
const workspace=document.querySelector("[data-workspace]");
const importStatus=document.querySelector("[data-import-status]");
const submitStatus=document.querySelector("[data-submit-status]");
const submissionsSection=document.querySelector("[data-submissions-section]");
const stepper=document.querySelector("[data-stepper]");
const stepSections=[...document.querySelectorAll("[data-step]")];
const aiWorkspace=document.querySelector("[data-ai-workspace]");
const uploadPanel=document.querySelector("[data-upload-panel]");
let phase=1;

function setPhase(next){const changed=phase!==next;phase=next;let activeSection=null;for(const section of stepSections){const active=Number(section.dataset.step)===phase;section.hidden=!active;if(active)activeSection=section;}for(const indicator of stepper.querySelectorAll("[data-step-indicator]")){const step=Number(indicator.dataset.stepIndicator);indicator.classList.toggle("active",step===phase);indicator.classList.toggle("complete",step<phase);if(step===phase)indicator.setAttribute("aria-current","step");else indicator.removeAttribute("aria-current");}const workspaceStatus=document.querySelector("[data-import-status]");workspaceStatus.hidden=phase<2||phase>3||creationMethod==="upload";if(creationMethod==="upload")uploadPanel.hidden=phase!==3;if(changed&&activeSection)requestAnimationFrame(()=>activeSection.scrollIntoView({behavior:"smooth",block:"start"}));}

setupAuth(async()=>{contributorEntry.hidden=true;workspace.hidden=false;stepper.hidden=false;submissionsSection.hidden=false;setPhase(conversionSource?3:1);await Promise.all([loadDrafts(),loadSubmissions(),revealAdministrationEntry()]);if(conversionSource)setStatus(importStatus,"A personal lesson was copied from Fydor. Paste it into the lesson JSON field, then continue through the same contributor review workflow.");});

async function revealAdministrationEntry(){
  const link=document.querySelector("[data-admin-entry]");
  try {
    const { actor }=await api("/api/contributor?action=me");
    if (actor.roles.some((role)=>role==="admin"||role==="super_admin")) {
      link.hidden=false;
      link.addEventListener("click",()=>sessionStorage.setItem("fydor-admin-entry","contribute"));
    }
  } catch { link.hidden=true; }
}

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
document.querySelectorAll("[data-method]").forEach((button)=>button.addEventListener("click",()=>{setMethod(button.dataset.method);setPhase(button.dataset.method==="upload"?3:2);if(button.dataset.method==="upload")document.querySelector("[data-upload-file]").click();}));
document.querySelector("[data-upload-file]").addEventListener("change",(event)=>readUpload(event.target.files?.[0]));
document.querySelector("[data-upload-clear]").addEventListener("click",clearUpload);
document.querySelector("[data-upload-continue]").addEventListener("click",async()=>{await saveDraft();});
const uploadDropzone=document.querySelector("[data-upload-dropzone]");
uploadDropzone.addEventListener("dragover",(event)=>{event.preventDefault();uploadDropzone.classList.add("dragging");});
uploadDropzone.addEventListener("dragleave",()=>uploadDropzone.classList.remove("dragging"));
uploadDropzone.addEventListener("drop",(event)=>{event.preventDefault();uploadDropzone.classList.remove("dragging");readUpload(event.dataTransfer.files?.[0]);});
document.querySelectorAll("[data-step-back]").forEach((button)=>button.addEventListener("click",()=>setPhase(Number(button.dataset.stepBack)-1)));
document.querySelectorAll("[data-step-next]").forEach((button)=>button.addEventListener("click",async()=>{const step=Number(button.dataset.stepNext);if(step===2){setPhase(3);return;}if(step===3){await saveDraft();return;}if(step===4){const total=packSentences(validatedPack).length;const reviewed=[...reviews.values()].filter((status)=>status==="reviewed").length;if(!draft||reviewed!==total){setStatus(importStatus,"Review every sentence before continuing to submission.");return;}setPhase(5);}}));
window.addEventListener("keydown",(event)=>{if(event.target.matches("input,textarea,select"))return;if(event.key==="ArrowLeft"||event.key==="k")move(-1);if(event.key==="ArrowRight"||event.key==="j")move(1);if(event.key.toLowerCase()==="r")mark("reviewed");});

async function copyPrompt(){if(!prompt)throwStatus("Generate the prompt first.");try{await navigator.clipboard.writeText(prompt);setStatus(importStatus,"Prompt copied.",true);return true;}catch{setStatus(importStatus,"Clipboard access was denied. Select the prompt and copy it manually.");return false;}}
async function copyAndOpen(provider){if(!await copyPrompt())return;const config=await getConfig();const url=config.providerUrls?.[provider];if(!["https://chatgpt.com/","https://claude.ai/"].includes(url)){setStatus(importStatus,"The chatbot destination is not allowlisted.");return;}generationSource=provider;window.open(url,"_blank","noopener,noreferrer");}
async function validateJson(){setStatus(importStatus,"Validating…");try{const result=await api("/api/contributor",{method:"POST",body:{action:"validate",pack:document.querySelector("[data-json-input]").value}});validatedPack=result.pack;document.querySelector("[data-json-input]").value=JSON.stringify(result.pack,null,2);setStatus(importStatus,`Valid Fydor pack · ${result.sentenceCount} sentences · ${result.contentHash}`,true);return result;}catch(error){validatedPack=null;setStatus(importStatus,error.message);return null;}}
async function saveDraft(){if(draftSavePending)return;const result=validatedPack?{pack:validatedPack}:await validateJson();if(!result)return;const statusTarget=creationMethod==="upload"?document.querySelector("[data-upload-status]"):importStatus;setDraftSavePending(true);setStatus(statusTarget,"Saving contributor draft…");try{const body={action:conversionSource?"convert_personal":"save_draft",pack:validatedPack,state:"reviewing",generationSource,creationMethod,promptTemplateVersion:document.querySelector("[data-template-version]").textContent,resetReview:true,...(conversionSource?{personalLessonId:conversionSource}:{})};if(draft){body.draftId=draft.id;body.expectedRevision=draft.revision;}const response=await api("/api/contributor",{method:"POST",body});draft=response.draft;reviews.clear();sentenceIndex=0;const sentences=packSentences(validatedPack);const jump=document.querySelector("[data-sentence-jump]");jump.replaceChildren(...sentences.map((sentence,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=`${index+1}. ${sentence.text.slice(0,50)}`;return option;}));renderPackPreview(validatedPack,document.querySelector("[data-pack-preview]"));renderSentence();await refreshPreflight();setPhase(4);setStatus(statusTarget,`${conversionSource?"Contributor copy created; the personal lesson remains unchanged.":"Contributor draft saved."} Revision ${draft.revision}; review progress is incomplete.`,true);}catch(error){setStatus(statusTarget,error.message);setWorkspaceStatus("Draft saving is unavailable. Check the service setup, then try again; your validated pack is still ready to submit.");}finally{setDraftSavePending(false);}}
async function mark(status){if(!draft)return;try{await api("/api/contributor",{method:"POST",body:{action:"review_sentence",draftId:draft.id,sentenceIndex,status}});reviews.set(sentenceIndex,status);renderSentence();await refreshPreflight();if(status==="reviewed")move(1);}catch(error){setStatus(submitStatus,error.message);}}
function move(delta){if(!validatedPack)return;const candidates=filteredIndexes();const current=candidates.indexOf(sentenceIndex);const next=candidates[Math.max(0,Math.min(candidates.length-1,current+delta))];if(next!==undefined){sentenceIndex=next;renderSentence();}}
function filteredIndexes(){if(!validatedPack)return[];const filter=document.querySelector("[data-review-filter]").value;return packSentences(validatedPack).map((_,i)=>i).filter((i)=>filter==="all"||(filter==="incomplete"&&reviews.get(i)!=="reviewed")||reviews.get(i)===filter);}
function renderSentence(){if(!validatedPack)return;const sentences=packSentences(validatedPack);const candidates=filteredIndexes();if(!candidates.includes(sentenceIndex))sentenceIndex=candidates[0]??0;document.querySelector("[data-sentence-jump]").value=String(sentenceIndex);const sentence=sentences[sentenceIndex];const target=document.querySelector("[data-sentence-review]");target.replaceChildren();if(!sentence){target.textContent="No sentences match this filter.";return;}const card=document.createElement("article");card.className="sentence-review";const heading=document.createElement("div");heading.className="workspace-actions";heading.append(node("strong",`Sentence ${sentenceIndex+1} of ${sentences.length}`),badge(reviews.get(sentenceIndex)||"unreviewed"));card.append(heading,node("p",sentence.text,"source"),node("p",sentence.translation));const dl=document.createElement("dl");appendDetail(dl,"Words",formatAnnotations(sentence.words));appendDetail(dl,"Grammar",formatAnnotations(sentence.grammar));appendDetail(dl,"Chunks",formatAnnotations(sentence.chunks));card.append(dl);target.append(card);renderProgress();}
function renderProgress(){const total=packSentences(validatedPack).length;const reviewed=[...reviews.values()].filter((x)=>x==="reviewed").length;const pct=total?Math.round(reviewed/total*100):0;document.querySelector("[data-review-count]").textContent=`${reviewed}/${total} reviewed · ${pct}% · ${total-reviewed} remaining`;document.querySelector("[data-review-bar]").style.width=`${pct}%`;}
async function refreshPreflight(){if(!draft)return;try{const data=await api(`/api/contributor?action=preflight&id=${encodeURIComponent(draft.id)}`);const p=data.preflight;const target=document.querySelector("[data-preflight]");target.replaceChildren();const dl=document.createElement("dl");for(const [label,value] of [["Lesson",p.title],["Languages",`${p.targetLanguage} → ${p.baseLanguage}`],["Level",p.level],["Sentences",p.sentenceCount],["Schema",p.schemaVersion],["Prompt template",p.promptTemplateVersion||"manual"],["Generation source",p.generationSource],["Review",`${p.reviewed}/${p.total}`],["Revision",p.revision],["Content hash",p.contentHash],["Readiness",p.ready?"Ready to submit":"Incomplete"]])appendDetail(dl,label,value);target.append(dl);document.querySelector("[data-submit]").disabled=!p.ready;}catch(error){setStatus(submitStatus,error.message);}}
async function submit(){if(!draft||!document.querySelector("[data-confirm]").checked){setStatus(submitStatus,"Confirm that you reviewed the lesson before submitting.");return;}try{const response=await api("/api/contributor",{method:"POST",idempotencyKey:randomActionId("submit"),body:{action:"submit",draftId:draft.id,expectedRevision:draft.revision,confirmed:true}});setStatus(submitStatus,`Submitted immutable version ${response.submission.version}. Content hash: ${response.submission.contentHash}`,true);document.querySelector("[data-submit]").disabled=true;await loadSubmissions();}catch(error){setStatus(submitStatus,error.message);}}
async function loadDrafts(){try{const data=await api("/api/contributor?action=drafts");const select=document.querySelector("[data-saved-drafts]");select.replaceChildren(node("option","New contributor draft"));select.firstElementChild.value="";for(const item of data.drafts){const option=node("option",`${item.title} · revision ${item.revision} · ${item.state}`);option.value=item.id;select.append(option);}if(data.drafts[0])setStatus(importStatus,`You have ${data.drafts.length} saved contributor draft(s).`,true);setWorkspaceStatus("");}catch(error){setStatus(importStatus,error.message);setWorkspaceStatus("Draft history could not load. You can keep working locally and use Refresh after the contributor service recovers.");}}
async function loadSelectedDraft(){const id=document.querySelector("[data-saved-drafts]").value;if(!id)return;try{const data=await api(`/api/contributor?action=draft&id=${encodeURIComponent(id)}`);draft=data.draft;validatedPack=draft.canonical_json;creationMethod=draft.creation_method||"ai";setMethod(creationMethod);reviews.clear();for(const review of draft.sentence_review_progress||[])reviews.set(review.sentence_index,review.status);document.querySelector("[data-json-input]").value=JSON.stringify(validatedPack,null,2);const jump=document.querySelector("[data-sentence-jump]");jump.replaceChildren(...packSentences(validatedPack).map((sentence,index)=>{const option=node("option",`${index+1}. ${sentence.text.slice(0,50)}`);option.value=String(index);return option;}));sentenceIndex=0;renderPackPreview(validatedPack,document.querySelector("[data-pack-preview]"));renderSentence();await refreshPreflight();setPhase(4);setStatus(importStatus,`Resumed ${draft.title} at revision ${draft.revision}.`,true);}catch(error){setStatus(importStatus,error.message);}}
async function loadSubmissions(){const target=document.querySelector("[data-submissions]");try{const data=await api("/api/contributor?action=submissions");target.replaceChildren();for(const item of data.submissions){const card=document.createElement("article");card.className="sentence-review";card.append(node("strong",item.title),badge(item.state),node("p",`${item.target_language} → ${item.base_language} · version ${item.current_version} · ${new Date(item.updated_at).toLocaleString()}`));if(item.state==="submitted"){const button=node("button","Withdraw submission");button.className="button secondary";button.addEventListener("click",async()=>{if(!confirm("Withdraw this submitted version from review?"))return;try{await api("/api/contributor",{method:"POST",idempotencyKey:randomActionId("withdraw"),body:{action:"withdraw",submissionId:item.id}});await loadSubmissions();}catch(error){setStatus(submitStatus,error.message);}});card.append(button);}target.append(card);}if(!data.submissions.length)target.append(node("p","No submissions yet."));setWorkspaceStatus("");}catch(error){target.replaceChildren(node("p",error.message,"workspace-error"));setWorkspaceStatus("Submission history could not load. Refresh when the contributor service is available again.");}}
function setDraftSavePending(pending){draftSavePending=pending;for(const selector of ["[data-save-draft]","[data-upload-continue]","[data-step-next=\"3\"]"]){for(const button of document.querySelectorAll(selector)){button.disabled=pending;button.setAttribute("aria-busy",String(pending));}}}
function setWorkspaceStatus(message){const target=document.querySelector("[data-workspace-status]");if(target)target.textContent=message;}
function appendDetail(dl,label,value){dl.append(node("dt",label),node("dd",value||"None"));}
function formatAnnotations(items){return items?.map((item)=>`${item.surface||item.pattern}: ${item.meaning||item.explanation||"annotated"}`).join("; ")||"None";}
function node(tag,value,className){const el=document.createElement(tag);el.textContent=String(value??"");if(className)el.className=className;return el;}
function badge(status){const el=node("span",status.replace("_"," "));el.className=`status-badge ${status}`;return el;}
function setStatus(element,message,success=false){element.textContent=message;element.className=success?"workspace-success":"workspace-error";}
function throwStatus(message){setStatus(importStatus,message);return false;}

function setMethod(method) {
  creationMethod=method === "upload" ? "upload" : "ai";
  for (const button of document.querySelectorAll("[data-method]")) {
    const selected=button.dataset.method===creationMethod;
    button.classList.toggle("active",selected); button.setAttribute("aria-selected",String(selected));
  }
  aiWorkspace.hidden=creationMethod!=="ai";
  uploadPanel.hidden=creationMethod!=="upload" || phase>=3;
  document.querySelector("[data-method-status]").textContent=creationMethod==="upload"?"Existing pack selection is active. It uses the same review and moderation pipeline as AI-generated packs.":"AI generation is selected.";
}

async function readUpload(file) {
  if (!file) return;
  const status=document.querySelector("[data-upload-status]");
  if (!file.name.toLowerCase().endsWith(".json") && !file.name.toLowerCase().endsWith(".fydorpack")) { setStatus(status,"Choose a .fydorpack or .json Fydor pack. Other file types are not accepted."); return; }
  if (file.size>5_000_000) { setStatus(status,"This file is larger than the 5 MB limit."); return; }
  document.querySelector("[data-upload-file-name]").textContent=`Selected file: ${file.name}`;
  setStatus(status,"Reading and validating pack…");
  try {
    const source=await file.text();
    let parsed; try { parsed=JSON.parse(source); } catch { throw new Error("This file is not valid JSON. Check the file and try again."); }
    const result=await api("/api/contributor",{method:"POST",body:{action:"validate_pack",pack:parsed}});
    validatedPack=result.pack; draft=null; reviews.clear(); sentenceIndex=0;
    renderPackPreview(validatedPack,document.querySelector("[data-upload-preview]"),{label:"Validated pack preview"});
    document.querySelector("[data-upload-continue]").disabled=false;
    setStatus(status,`Valid Fydor pack · ${result.sentenceCount} sentences · ready for review.`,true);
  } catch (error) {
    validatedPack=null; document.querySelector("[data-upload-continue]").disabled=true; document.querySelector("[data-upload-preview]").replaceChildren(); setStatus(status,error.message);
  }
}

function clearUpload() {
  document.querySelector("[data-upload-file]").value="";
  document.querySelector("[data-upload-file-name]").textContent="";
  document.querySelector("[data-upload-preview]").replaceChildren();
  document.querySelector("[data-upload-continue]").disabled=true;
  setStatus(document.querySelector("[data-upload-status]"),"Choose another .fydorpack or .json pack.");
  validatedPack=null; draft=null; reviews.clear();
}

function packSentences(pack) { if(Array.isArray(pack?.lessons)) return pack.lessons.flatMap((lesson)=>lesson.sentences || []); return Array.isArray(pack?.sentences)?pack.sentences:[]; }
