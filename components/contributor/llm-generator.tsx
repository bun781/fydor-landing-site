"use client";

import { useState } from "react";
import { LANGUAGE_OPTIONS } from "@/lib/contributor-pack";
import { api } from "@/lib/website-api";

export type GenerationSource = "manual" | "chatgpt" | "claude" | "external";

type PromptInput = {
  targetLanguage: string;
  baseLanguage: string;
  level: string;
  topic: string;
  learningGoals: string;
  ideas: string;
  grammarGoals: string;
  vocabularyGoals: string;
  sentenceCount: string;
  annotationDepth: string;
  sentenceStyle: string;
  tone: string;
  difficultyProgression: string;
  regionalPreference: string;
  culturalContext: string;
  specialConstraints: string;
  sourceMaterial: string;
  schemaVersion: string;
};

const initialInput: PromptInput = {
  targetLanguage: "ko", baseLanguage: "en", level: "beginner", topic: "",
  learningGoals: "", ideas: "", grammarGoals: "", vocabularyGoals: "",
  sentenceCount: "10", annotationDepth: "useful vocabulary and grammar",
  sentenceStyle: "natural everyday sentences", tone: "clear and learner-friendly",
  difficultyProgression: "start simple and build gradually", regionalPreference: "",
  culturalContext: "", specialConstraints: "", sourceMaterial: "", schemaVersion: "1"
};

type Props = {
  onBack: () => void;
  onLoadJson: (text: string, source: GenerationSource) => void;
};

export function LlmGenerator({ onBack, onLoadJson }: Props) {
  const [input, setInput] = useState<PromptInput>(initialInput);
  const [prompt, setPrompt] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [generatedJson, setGeneratedJson] = useState("");
  const [source, setSource] = useState<GenerationSource>("external");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function updateField<K extends keyof PromptInput>(field: K, value: PromptInput[K]) {
    setInput((current) => ({ ...current, [field]: value }));
  }

  async function createPrompt() {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ prompt: string; templateVersion: string }>("/api/contributor", { method: "POST", body: { action: "prompt", input } });
      setPrompt(result.prompt); setTemplateVersion(result.templateVersion); setMessage("Prompt ready. Copy it into your LLM of choice.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create the prompt."); }
    finally { setBusy(false); }
  }

  async function copyPrompt(nextSource: GenerationSource = "external") {
    if (!prompt) { setMessage("Create the prompt first."); return; }
    try {
      await navigator.clipboard.writeText(prompt);
      setSource(nextSource); setMessage("Prompt copied. Paste it into your LLM, then bring the JSON back here.");
    } catch { setMessage("Your browser did not allow clipboard access. Select and copy the prompt manually."); }
  }

  async function copyAndOpen(provider: "chatgpt" | "claude") {
    await copyPrompt(provider);
    window.open(provider === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/", "_blank", "noopener,noreferrer");
  }

  return <section className="workspace-card llm-generator">
    <div className="workspace-header">
      <div><span className="eyebrow">Additional creation option</span><h1>Generate lesson JSON with an LLM</h1><p>Describe the lesson you want, copy the generated instruction into ChatGPT, Claude, or another model, then validate the returned Fydor Pack before editing or submitting it.</p></div>
      <button className="text-button" onClick={onBack}>← Back to my packs</button>
    </div>

    <div className="callout llm-callout"><div><strong>This does not replace the other workflows.</strong><p>Use <b>Create pack</b> to write lessons yourself, or <b>Import Fydor JSON</b> to bring in an existing `.fydorpack`. LLM output is only a draft and is still checked by Fydor.</p></div></div>

    <ol className="llm-steps"><li>Fill in the lesson brief.</li><li>Create and copy the prompt.</li><li>Ask your LLM for one JSON object.</li><li>Paste the response below to load it into the normal editor.</li></ol>

    <div className="form-grid">
      <label>Learning language<select value={input.targetLanguage} onChange={(event) => updateField("targetLanguage", event.target.value)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <label>Translation language<select value={input.baseLanguage} onChange={(event) => updateField("baseLanguage", event.target.value)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <Field label="Topic" value={input.topic} placeholder="e.g. ordering coffee politely" onChange={(value) => updateField("topic", value)} />
      <Field label="Level" value={input.level} placeholder="beginner" onChange={(value) => updateField("level", value)} />
      <Field label="Learning goals" value={input.learningGoals} placeholder="What should the learner be able to do?" onChange={(value) => updateField("learningGoals", value)} />
      <Field label="Vocabulary goals" value={input.vocabularyGoals} placeholder="Useful words or themes" onChange={(value) => updateField("vocabularyGoals", value)} />
      <Field label="Grammar goals" value={input.grammarGoals} placeholder="Patterns to teach" onChange={(value) => updateField("grammarGoals", value)} />
      <Field label="Sentence count" value={input.sentenceCount} placeholder="10" onChange={(value) => updateField("sentenceCount", value)} />
      <label className="span-2">Ideas or special instructions<textarea rows={3} value={input.ideas} onChange={(event) => updateField("ideas", event.target.value)} placeholder="Add context, situations, or constraints for the lesson." /></label>
      <label className="span-2">Source material (optional)<textarea rows={5} value={input.sourceMaterial} onChange={(event) => updateField("sourceMaterial", event.target.value)} placeholder="Paste a short text, vocabulary list, or notes for the LLM to use as source material. Do not include API keys or private information." /></label>
    </div>

    <div className="workspace-actions"><button className="button" disabled={busy} onClick={() => void createPrompt()}>{busy ? "Creating prompt…" : "Create prompt"}</button></div>
    {prompt ? <section className="llm-prompt-result"><div className="workspace-header"><div><span className="eyebrow">{templateVersion || "Versioned prompt"}</span><h2>Copy this prompt into your LLM</h2></div><div className="workspace-actions"><button className="button secondary" onClick={() => void copyPrompt()}>Copy prompt</button><button className="button secondary" onClick={() => void copyAndOpen("chatgpt")}>Copy + ChatGPT</button><button className="button secondary" onClick={() => void copyAndOpen("claude")}>Copy + Claude</button></div></div><pre className="prompt-block">{prompt}</pre></section> : null}

    <section className="llm-return"><div><span className="eyebrow">Bring the result back</span><h2>Paste the JSON returned by the LLM</h2><p>Ask for JSON only. Fydor will validate the pack before opening it in the same editor used by manually written and imported packs.</p></div><textarea rows={10} value={generatedJson} onChange={(event) => setGeneratedJson(event.target.value)} placeholder='{"type":"fydor_pack", ...}' /><div className="workspace-actions"><button className="button" disabled={!generatedJson.trim()} onClick={() => onLoadJson(generatedJson, source)}>Load JSON into editor</button></div></section>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
