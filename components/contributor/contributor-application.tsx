"use client";

import { useState } from "react";

export type ContributorApplication = {
  id: string;
  target_languages: string[];
  experience: string;
  sample_plan: string;
  state: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  probation_until: string | null;
};

export function ContributorApplicationGate({ application, submitting, onSubmit }: { application: ContributorApplication | null; submitting: boolean; onSubmit: (value: { targetLanguages: string[]; experience: string; samplePlan: string }) => Promise<void> }) {
  const [languages, setLanguages] = useState(application?.target_languages.join(", ") || "");
  const [experience, setExperience] = useState(application?.experience || "");
  const [samplePlan, setSamplePlan] = useState(application?.sample_plan || "");
  const pending = application?.state === "pending";
  if (pending) return <section className="workspace-card compact-card"><span className="eyebrow">Contributor application</span><h1>Your application is in review.</h1><p>Thanks—we will review your proposed languages and first-pack plan before opening the moderation queue to you. We’ll notify you here once a reviewer has decided.</p><p className="application-meta">Submitted {date(application.submitted_at)} · usually reviewed manually</p></section>;
  return <section className="workspace-card contributor-application"><span className="eyebrow">Step 1 of 3 · contributor access</span><h1>{application?.state === "rejected" ? "Update your contributor application" : "Apply to contribute packs"}</h1><p>Contributor access protects a small human moderation queue. Tell us what you plan to teach; after approval, start with up to two packs a day, each under 1 MB, for your first 30 days.</p>
    {application?.state === "rejected" ? <div className="application-note"><strong>Reviewer guidance</strong><p>{application.reviewer_note || "Please add more detail and resubmit."}</p></div> : null}
    <ol className="application-steps"><li>Choose the languages you can responsibly create or review.</li><li>Describe relevant language, teaching, or content experience.</li><li>Outline a focused first pack for moderation.</li></ol>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); const targetLanguages = [...new Set(languages.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))]; void onSubmit({ targetLanguages, experience, samplePlan }); }}>
      <label>Languages you plan to contribute<input required value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="e.g. vi, en" /><small>Use comma-separated language codes. Choose only languages you can verify carefully.</small></label>
      <label>Your relevant experience<textarea required minLength={40} maxLength={3000} rows={5} value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Language background, teaching, editing, or curriculum experience…" /><small>{experience.trim().length}/3000 characters · minimum 40</small></label>
      <label>Your first pack plan<textarea required minLength={40} maxLength={3000} rows={5} value={samplePlan} onChange={(event) => setSamplePlan(event.target.value)} placeholder="Topic, learner level, approximate scope, and how you will check translations and annotations…" /><small>{samplePlan.trim().length}/3000 characters · minimum 40</small></label>
      <div className="workspace-actions"><button className="button" disabled={submitting}>{submitting ? "Sending…" : application?.state === "rejected" ? "Resubmit application" : "Send application"}</button></div>
    </form>
  </section>;
}

export function ProbationGuide({ until }: { until: string | null | undefined }) {
  if (!until || Date.parse(until) <= Date.now()) return null;
  return <div className="workspace-message" role="status"><strong>New contributor guide</strong><br />Until {date(until)}, submit up to two packs per day, each up to 1 MB. Start with a focused pack, check every translation and annotation, and use the sentence-review step before submitting.</div>;
}

function date(value: string) { return new Date(value).toLocaleDateString(); }
