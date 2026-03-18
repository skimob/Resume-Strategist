"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as mammoth from "mammoth";

// ─── Constants ───────────────────────────────────────────────────────────────

const MODES = { CHAT: "chat", RESUME: "resume", JOB: "job", SETTINGS: "settings", HISTORY: "history", SCORE: "score", INTERVIEW: "interview", DIFF: "diff" };

const SECTION_CHECKLIST = ["Contact Info", "Summary / Objective", "Work Experience", "Skills", "Education", "Bullet Points", "ATS Keywords", "Quantified Achievements"];

const QUICK_FOLLOW_UPS = [
  ["Make it more concise", "Add more metrics", "Adjust for senior level", "Make it more formal"],
  ["Strengthen the opening", "Add industry keywords", "Improve action verbs", "Make bullets punchier"],
];

// ─── Prompts ─────────────────────────────────────────────────────────────────

const buildSystemPrompt = (resume, jobDesc, prefs) => {
  const tone = prefs?.tone || "professional";
  const level = prefs?.level || "mid";
  const industry = prefs?.industry || "general";

  let prompt = `You are an elite resume strategist and career coach with 15+ years of experience. You specialize in resume tailoring, ATS optimization, impact quantification, and career narrative.

User preferences: tone=${tone}, target level=${level}, industry=${industry}.

Your approach:
- Provide specific, actionable rewrites — not generic advice
- Explain WHY each change improves the resume
- Flag red flags or gaps proactively
- After each response, suggest 3-4 short follow-up actions the user might want (prefix them with "**Follow-ups:**" on a new line, as a bullet list)
- Be direct, honest, and encouraging`;

  if (resume?.trim()) prompt += `\n\n---\n[USER'S RESUME]\n${resume}`;
  if (jobDesc?.trim()) prompt += `\n\n---\n[TARGET JOB DESCRIPTION]\n${jobDesc}`;
  return prompt;
};

const SCORE_PROMPT = `You are a resume ATS and quality analyzer. Given a resume and optionally a job description, return a JSON object with this exact shape:
{
  "overall": <0-100>,
  "ats": <0-100>,
  "impact": <0-100>,
  "clarity": <0-100>,
  "keywords_found": ["word1","word2",...],
  "keywords_missing": ["word1","word2",...],
  "strengths": ["strength1","strength2","strength3"],
  "weaknesses": ["weakness1","weakness2","weakness3"],
  "checklist": {
    "Contact Info": true/false,
    "Summary / Objective": true/false,
    "Work Experience": true/false,
    "Skills": true/false,
    "Education": true/false,
    "Bullet Points": true/false,
    "ATS Keywords": true/false,
    "Quantified Achievements": true/false
  }
}
Return ONLY the JSON object. No explanation, no markdown fences.`;

const INTERVIEW_PROMPT = `You are an expert interview coach. Given the user's resume and target job description, generate 8 highly targeted interview questions they are likely to face, along with a brief coaching tip for each.

Format your response as:
## Behavioral Questions
1. **[Question]**
   *Tip: [brief coaching tip]*

## Technical / Role-Specific Questions  
2. **[Question]**
   *Tip: [brief coaching tip]*

## Questions About Their Background
3. **[Question]**
   *Tip: [brief coaching tip]*

Generate 2-3 questions per category. Make them specific to the resume and role — not generic.`;

const EXPORT_SYSTEM_PROMPT = `You are a resume rewriting assistant. Produce a rewritten version incorporating all discussed improvements.
RULES:
- Output ONLY the rewritten resume text
- Preserve the EXACT same number of non-empty paragraphs as the original
- Preserve blank lines in the same positions
- Keep names, contact info, dates, company names unchanged unless explicitly changed
- Output plain text only — no markdown, no bullet symbols, no ## headers`;

// ─── Formatting ──────────────────────────────────────────────────────────────

const formatInline = (text) => {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**")) return <strong key={i} style={{ color: "#e8d898", fontWeight: 600 }}>{tok.slice(2, -2)}</strong>;
    if (tok.startsWith("*") && tok.endsWith("*")) return <em key={i} style={{ color: "#c8b870", fontStyle: "italic" }}>{tok.slice(1, -1)}</em>;
    if (tok.startsWith("`") && tok.endsWith("`")) return <code key={i} style={{ background: "#2a2420", color: "#d4a853", padding: "0.1em 0.35em", borderRadius: 4, fontSize: "0.85em", fontFamily: "monospace" }}>{tok.slice(1, -1)}</code>;
    return tok;
  });
};

const formatMessage = (text) => {
  const classified = text.split("\n").map(line => {
    if (/^### /.test(line)) return { type: "h3", content: line.slice(4) };
    if (/^## /.test(line)) return { type: "h2", content: line.slice(3) };
    if (/^# /.test(line)) return { type: "h1", content: line.slice(2) };
    if (/^\*\*[^*].+\*\*$/.test(line.trim()) && !line.trim().slice(2,-2).includes("**")) return { type: "bold-line", content: line.trim().slice(2, -2) };
    if (/^[-*] /.test(line)) return { type: "bullet", content: line.replace(/^[-*] /, "") };
    if (/^\d+\. /.test(line)) return { type: "numbered", content: line.replace(/^\d+\. /, "") };
    if (/^> /.test(line)) return { type: "quote", content: line.slice(2) };
    if (line.trim() === "") return { type: "blank" };
    return { type: "para", content: line };
  });

  const blocks = [];
  let i = 0;
  while (i < classified.length) {
    const c = classified[i];
    if (c.type === "bullet") {
      const items = [];
      while (i < classified.length && classified[i].type === "bullet") { items.push(classified[i].content); i++; }
      blocks.push({ type: "bullet-list", items });
    } else if (c.type === "numbered") {
      const items = [];
      while (i < classified.length && classified[i].type === "numbered") { items.push(classified[i].content); i++; }
      blocks.push({ type: "numbered-list", items });
    } else { blocks.push(c); i++; }
  }

  const collapsed = blocks.filter((b, idx) => !(b.type === "blank" && blocks[idx - 1]?.type === "blank"));

  return collapsed.map((block, idx) => {
    switch (block.type) {
      case "h1": return <div key={idx} style={{ marginTop: idx > 0 ? "1.5rem" : 0, marginBottom: "0.6rem" }}><div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", fontWeight: 700, color: "#e8c97a", lineHeight: 1.3 }}>{formatInline(block.content)}</div><div style={{ height: 1, background: "linear-gradient(90deg, #d4a85360, transparent)", marginTop: "0.3rem" }} /></div>;
      case "h2": return <div key={idx} style={{ marginTop: idx > 0 ? "1.25rem" : 0, marginBottom: "0.45rem" }}><div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#d4a853", letterSpacing: "0.1em", textTransform: "uppercase" }}>{formatInline(block.content)}</div><div style={{ height: 1, background: "linear-gradient(90deg, #d4a85340, transparent)", marginTop: "0.25rem" }} /></div>;
      case "h3": return <div key={idx} style={{ marginTop: "0.9rem", marginBottom: "0.3rem", fontWeight: 600, fontSize: "0.9rem", color: "#c8a84a" }}>{formatInline(block.content)}</div>;
      case "bold-line": return <div key={idx} style={{ marginTop: "0.6rem", marginBottom: "0.15rem", fontWeight: 600, color: "#e8d898", fontSize: "0.9rem" }}>{formatInline(block.content)}</div>;
      case "bullet-list": return <ul key={idx} style={{ margin: "0.4rem 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>{block.items.map((item, j) => <li key={j} style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", lineHeight: 1.65, fontSize: "0.875rem", color: "#d8d0c4" }}><span style={{ color: "#d4a853", flexShrink: 0, marginTop: "0.32em", fontSize: "0.5rem" }}>◆</span><span>{formatInline(item)}</span></li>)}</ul>;
      case "numbered-list": return <ol key={idx} style={{ margin: "0.4rem 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>{block.items.map((item, j) => <li key={j} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", lineHeight: 1.65, fontSize: "0.875rem", color: "#d8d0c4" }}><span style={{ color: "#d4a853", flexShrink: 0, fontWeight: 600, fontSize: "0.8rem", minWidth: "1rem", textAlign: "right" }}>{j + 1}.</span><span>{formatInline(item)}</span></li>)}</ol>;
      case "quote": return <div key={idx} style={{ borderLeft: "3px solid #d4a853", paddingLeft: "0.8rem", margin: "0.5rem 0", color: "#a89060", fontStyle: "italic", fontSize: "0.87rem", lineHeight: 1.65 }}>{formatInline(block.content)}</div>;
      case "blank": return <div key={idx} style={{ height: "0.55rem" }} />;
      default: return <p key={idx} style={{ margin: 0, lineHeight: 1.7, fontSize: "0.875rem", color: "#d8d0c4" }}>{formatInline(block.content)}</p>;
    }
  });
};

// ─── TypewriterText ──────────────────────────────────────────────────────────

const TypewriterText = ({ text }) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
      else { clearInterval(iv); setDone(true); }
    }, 5);
    return () => clearInterval(iv);
  }, [text]);
  if (done) return <>{formatMessage(text)}</>;
  return <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "0.875rem", color: "#d8d0c4" }}>{displayed}<span className="cursor" style={{ color: "#d4a853" }}>▋</span></div>;
};

// ─── DOCX Patching ───────────────────────────────────────────────────────────

const loadJSZip = () => new Promise((resolve, reject) => {
  if (window.JSZip) return resolve(window.JSZip);
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  s.onload = () => resolve(window.JSZip); s.onerror = reject;
  document.head.appendChild(s);
});

const extractParagraphs = (xml) => [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => m[0]);
const paraText = (p) => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join("").trim();

const patchParaText = (para, newText) => {
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const runs = [...para.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)];
  if (!runs.length) return para;
  const patched = runs[0][0].replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t xml:space="preserve">${esc(newText)}</w:t>`);
  let result = para.replace(runs[0][0], patched);
  for (let i = 1; i < runs.length; i++) result = result.replace(runs[i][0], runs[i][0].replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/g, "<w:t></w:t>"));
  return result;
};

const patchAndDownloadDocx = async (originalAB, rewrittenText, filename) => {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(originalAB);
  let docXml = await zip.file("word/document.xml").async("string");
  const origParas = extractParagraphs(docXml);
  const origNonEmpty = origParas.map((p, idx) => ({ idx, text: paraText(p), para: p })).filter(p => p.text.length > 0);
  const rewrittenNonEmpty = rewrittenText.split("\n").filter(l => l.trim().length > 0);
  const count = Math.min(origNonEmpty.length, rewrittenNonEmpty.length);
  for (let i = 0; i < count; i++) {
    if (origNonEmpty[i].text !== rewrittenNonEmpty[i]) {
      docXml = docXml.replace(origNonEmpty[i].para, patchParaText(origNonEmpty[i].para, rewrittenNonEmpty[i]));
    }
  }
  zip.file("word/document.xml", docXml);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ─── Storage helpers ─────────────────────────────────────────────────────────

const STORAGE_KEY = "resume_agent_sessions";
const loadSessions = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
const saveSessions = (sessions) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 10))); } catch {} };

// ─── ScorePanel ──────────────────────────────────────────────────────────────

const ScoreRing = ({ value, label, color }) => {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#2a2420" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x={36} y={40} textAnchor="middle" fill="#e8e0d4" fontSize={14} fontWeight={700}
          style={{ transform: "rotate(90deg)", transformOrigin: "36px 36px" }}>{value}</text>
      </svg>
      <span style={{ fontSize: "0.72rem", color: "#7a6a50", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );
};

const ScorePanel = ({ resume, jobDesc, onClose }) => {
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/claude", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            system: SCORE_PROMPT,
            messages: [{ role: "user", content: `RESUME:\n${resume}\n\n${jobDesc ? `JOB DESCRIPTION:\n${jobDesc}` : ""}` }],
          }),
        });
        const data = await res.json();
        const raw = data.content?.[0]?.text || "{}";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        setScore(JSON.parse(cleaned));
      } catch { setError("Could not analyze resume. Please try again."); }
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#0f0e12", border: "1px solid #2a2420", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.15rem", fontWeight: 600 }}>Resume Score Analysis</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>

        {loading && <div style={{ textAlign: "center", color: "#7a6a50", padding: "2rem" }}>✦ Analyzing your resume...</div>}
        {error && <div style={{ color: "#c06060", textAlign: "center" }}>{error}</div>}

        {score && <>
          <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
            <ScoreRing value={score.overall} label="Overall" color="#d4a853" />
            <ScoreRing value={score.ats} label="ATS" color="#5b9bd5" />
            <ScoreRing value={score.impact} label="Impact" color="#5cb85c" />
            <ScoreRing value={score.clarity} label="Clarity" color="#c084fc" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ background: "#141218", borderRadius: 10, padding: "1rem", border: "1px solid #1e3a1e" }}>
              <div style={{ fontSize: "0.72rem", color: "#5cb85c", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>✓ Strengths</div>
              {score.strengths?.map((s, i) => <div key={i} style={{ fontSize: "0.82rem", color: "#a8c8a0", marginBottom: "0.3rem" }}>• {s}</div>)}
            </div>
            <div style={{ background: "#141218", borderRadius: 10, padding: "1rem", border: "1px solid #3a1e1e" }}>
              <div style={{ fontSize: "0.72rem", color: "#e07070", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>✗ Areas to Improve</div>
              {score.weaknesses?.map((w, i) => <div key={i} style={{ fontSize: "0.82rem", color: "#c8a0a0", marginBottom: "0.3rem" }}>• {w}</div>)}
            </div>
          </div>

          {jobDesc && score.keywords_missing?.length > 0 && (
            <div style={{ background: "#141218", borderRadius: 10, padding: "1rem", border: "1px solid #2a2420", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#9a8060", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>Missing Keywords</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {score.keywords_missing.map((k, i) => <span key={i} style={{ background: "rgba(192,96,96,0.15)", border: "1px solid #4a2a2a", borderRadius: 20, padding: "0.2rem 0.6rem", fontSize: "0.75rem", color: "#c09090" }}>{k}</span>)}
              </div>
              {score.keywords_found?.length > 0 && <>
                <div style={{ fontSize: "0.72rem", color: "#9a8060", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0.75rem 0 0.6rem" }}>Found Keywords</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {score.keywords_found.map((k, i) => <span key={i} style={{ background: "rgba(92,184,92,0.1)", border: "1px solid #2a4a2a", borderRadius: 20, padding: "0.2rem 0.6rem", fontSize: "0.75rem", color: "#80b880" }}>{k}</span>)}
                </div>
              </>}
            </div>
          )}

          <div style={{ background: "#141218", borderRadius: 10, padding: "1rem", border: "1px solid #2a2420" }}>
            <div style={{ fontSize: "0.72rem", color: "#9a8060", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>Section Checklist</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
              {SECTION_CHECKLIST.map(s => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: score.checklist?.[s] ? "#80b880" : "#906060" }}>
                  <span>{score.checklist?.[s] ? "✓" : "✗"}</span><span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
};

// ─── DiffView ────────────────────────────────────────────────────────────────

const DiffView = ({ original, rewritten, onClose }) => {
  const origLines = (original || "").split("\n");
  const newLines = (rewritten || "").split("\n");
  const maxLen = Math.max(origLines.length, newLines.length);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#0f0e12", border: "1px solid #2a2420", borderRadius: 16, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.75rem", borderBottom: "1px solid #2a2420" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.1rem", fontWeight: 600 }}>Before / After Comparison</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", overflowY: "auto", flex: 1 }}>
          <div style={{ borderRight: "1px solid #2a2420" }}>
            <div style={{ padding: "0.6rem 1rem", background: "#1a1418", fontSize: "0.72rem", color: "#906060", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #2a2420", position: "sticky", top: 0 }}>Original</div>
            <div style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.78rem", lineHeight: 1.8 }}>
              {origLines.map((line, i) => {
                const changed = line !== (newLines[i] || "");
                return <div key={i} style={{ background: changed ? "rgba(192,96,96,0.12)" : "transparent", padding: "0 0.25rem", borderRadius: 3, color: changed ? "#c09090" : "#6a6060", marginBottom: "0.1rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</div>;
              })}
            </div>
          </div>
          <div>
            <div style={{ padding: "0.6rem 1rem", background: "#141a14", fontSize: "0.72rem", color: "#60906a", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #2a2420", position: "sticky", top: 0 }}>Updated</div>
            <div style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.78rem", lineHeight: 1.8 }}>
              {newLines.map((line, i) => {
                const changed = line !== (origLines[i] || "");
                return <div key={i} style={{ background: changed ? "rgba(92,184,92,0.1)" : "transparent", padding: "0 0.25rem", borderRadius: 3, color: changed ? "#90c090" : "#6a6060", marginBottom: "0.1rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Settings Panel ──────────────────────────────────────────────────────────

const SettingsPanel = ({ prefs, onChange, onClose }) => {
  const field = (label, key, options) => (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ fontSize: "0.75rem", color: "#9a8060", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "0.4rem" }}>{label}</label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {options.map(opt => (
          <button key={opt.value} onClick={() => onChange({ ...prefs, [key]: opt.value })}
            style={{ padding: "0.4rem 0.85rem", borderRadius: 20, border: `1px solid ${prefs[key] === opt.value ? "#d4a853" : "#3a2e1a"}`, background: prefs[key] === opt.value ? "rgba(212,168,83,0.15)" : "transparent", color: prefs[key] === opt.value ? "#e8c97a" : "#6a5a40", cursor: "pointer", fontSize: "0.82rem", fontFamily: "'DM Sans', sans-serif" }}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#0f0e12", border: "1px solid #2a2420", borderRadius: 16, width: "100%", maxWidth: 480, padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.1rem", fontWeight: 600 }}>Preferences</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        {field("Tone", "tone", [{ value: "professional", label: "Professional" }, { value: "conversational", label: "Conversational" }, { value: "executive", label: "Executive" }, { value: "creative", label: "Creative" }])}
        {field("Target Level", "level", [{ value: "junior", label: "Junior" }, { value: "mid", label: "Mid-Level" }, { value: "senior", label: "Senior" }, { value: "executive", label: "Executive" }])}
        {field("Industry", "industry", [{ value: "general", label: "General" }, { value: "tech", label: "Tech" }, { value: "finance", label: "Finance" }, { value: "healthcare", label: "Healthcare" }, { value: "creative", label: "Creative" }, { value: "consulting", label: "Consulting" }])}
        <button onClick={onClose} style={{ width: "100%", marginTop: "0.5rem", background: "linear-gradient(135deg, #d4a853, #8b6520)", border: "none", borderRadius: 8, padding: "0.65rem", color: "#0d0d0f", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem", fontFamily: "'DM Sans', sans-serif" }}>Save Preferences</button>
      </div>
    </div>
  );
};

// ─── History Panel ───────────────────────────────────────────────────────────

const HistoryPanel = ({ sessions, onLoad, onDelete, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
    <div style={{ background: "#0f0e12", border: "1px solid #2a2420", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.75rem", borderBottom: "1px solid #2a2420" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.1rem", fontWeight: 600 }}>Session History</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "1rem" }}>
        {sessions.length === 0 && <div style={{ color: "#5a4a38", textAlign: "center", padding: "2rem", fontSize: "0.88rem" }}>No saved sessions yet. Sessions are saved automatically when you send messages.</div>}
        {sessions.map((s, i) => (
          <div key={i} style={{ background: "#141218", border: "1px solid #2a2420", borderRadius: 10, padding: "0.9rem 1rem", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.85rem", color: "#d8d0c4", fontWeight: 500, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.resumeFileName || "Pasted Resume"}</div>
              <div style={{ fontSize: "0.75rem", color: "#5a4a38" }}>{s.messageCount} messages · {new Date(s.savedAt).toLocaleDateString()}</div>
            </div>
            <button onClick={() => onLoad(s)} style={{ background: "rgba(212,168,83,0.1)", border: "1px solid #3a2e1a", borderRadius: 6, padding: "0.3rem 0.7rem", color: "#d4a853", cursor: "pointer", fontSize: "0.78rem", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>Load</button>
            <button onClick={() => onDelete(i)} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1rem", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── InterviewPanel ──────────────────────────────────────────────────────────

const InterviewPanel = ({ resume, jobDesc, onClose }) => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/claude", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1500,
            system: INTERVIEW_PROMPT,
            messages: [{ role: "user", content: `RESUME:\n${resume}\n\n${jobDesc ? `JOB DESCRIPTION:\n${jobDesc}` : "Generate general interview questions based on the resume."}` }],
          }),
        });
        const data = await res.json();
        setContent(data.content?.[0]?.text || "Could not generate questions.");
      } catch { setContent("Connection error. Please try again."); }
      setLoading(false);
    };
    run();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#0f0e12", border: "1px solid #2a2420", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.75rem", borderBottom: "1px solid #2a2420" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.1rem", fontWeight: 600 }}>Interview Prep</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a4a38", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "1.5rem 1.75rem" }}>
          {loading ? <div style={{ color: "#7a6a50", textAlign: "center", padding: "2rem" }}>✦ Generating interview questions...</div>
            : <>{formatMessage(content)}</>}
        </div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function ResumeAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(MODES.CHAT);
  const [resume, setResume] = useState("");
  const [resumeArrayBuffer, setResumeArrayBuffer] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [exportState, setExportState] = useState("idle");
  const [exportedText, setExportedText] = useState("");
  const [prefs, setPrefs] = useState({ tone: "professional", level: "mid", industry: "general" });
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [checklist, setChecklist] = useState({});
  const [jobUrl, setJobUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Auto-save session after each exchange
  useEffect(() => {
    if (messages.length < 2) return;
    const session = { resumeFileName, messageCount: messages.length, savedAt: Date.now(), messages, resume, jobDesc, prefs };
    const existing = loadSessions();
    // deduplicate by resumeFileName+date bucket
    const updated = [session, ...existing.filter((_, i) => i < 9)];
    saveSessions(updated);
    setSessions(updated);
  }, [messages]);

  const parseDocxFile = async (file) => {
    setFileError("");
    if (!file) return;
    const validTypes = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(docx|doc)$/i)) { setFileError("Please upload a .docx or .doc file."); return; }
    setFileLoading(true);
    try {
      const ab = await file.arrayBuffer();
      setResumeArrayBuffer(ab.slice(0));
      const result = await mammoth.extractRawText({ arrayBuffer: ab });
      setResume(result.value);
      setResumeFileName(file.name);
    } catch { setFileError("Could not read the file. Please try a .docx format or paste text instead."); }
    setFileLoading(false);
  };

  const fetchJobUrl = async () => {
    if (!jobUrl.trim()) return;
    setFetchingUrl(true);
    setFileError("");
    try {
      // Step 1: Scrape the page via Jina.ai (free, no API key needed)
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl.trim() }),
      });
      const scrapeData = await scrapeRes.json();

      if (!scrapeRes.ok || !scrapeData.text) {
        setFileError(scrapeData.error || "Could not read that page. Try pasting the job description manually.");
        setFetchingUrl(false);
        return;
      }

      // Step 2: Send the scraped text to Claude to extract just the job description
      const claudeRes = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: "You are given raw webpage text. Extract and return only the job description content — the role title, responsibilities, requirements, qualifications, and company description. Remove all navigation, ads, headers, footers, and unrelated content. Return plain text only, no markdown.",
          messages: [{ role: "user", content: `Extract the job description from this page content:\n\n${scrapeData.text}` }],
        }),
      });
      const claudeData = await claudeRes.json();
      const extracted = claudeData.content?.[0]?.text || "";

      if (extracted.length > 100) {
        setJobDesc(extracted);
        setJobUrl("");
        setActiveTab(MODES.CHAT);
      } else {
        setFileError("Could not extract a job description from that page. Please paste it manually.");
      }
    } catch {
      setFileError("Could not fetch that URL. Please paste the job description manually.");
    }
    setFetchingUrl(false);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          system: buildSystemPrompt(resume, jobDesc, prefs),
          messages: newMessages,
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";
      const finalMessages = [...newMessages, { role: "assistant", content: reply }];
      setMessages(finalMessages);
      // Update checklist heuristically based on what was discussed
      updateChecklist(reply);
    } catch { setMessages([...newMessages, { role: "assistant", content: "Connection error. Please try again." }]); }
    setLoading(false);
  };

  const updateChecklist = (reply) => {
    const lower = reply.toLowerCase();
    const updates = {};
    if (lower.includes("summary") || lower.includes("objective")) updates["Summary / Objective"] = true;
    if (lower.includes("bullet") || lower.includes("experience")) updates["Bullet Points"] = true;
    if (lower.includes("quantif") || lower.includes("metric") || lower.includes("%")) updates["Quantified Achievements"] = true;
    if (lower.includes("keyword") || lower.includes("ats")) updates["ATS Keywords"] = true;
    if (lower.includes("skill")) updates["Skills"] = true;
    setChecklist(prev => ({ ...prev, ...updates }));
  };

  const handleExport = async () => {
    if (!resume.trim()) { alert("Please upload a resume first."); return; }
    if (messages.length === 0) { alert("Have a conversation with the agent first so it knows what changes to make."); return; }
    if (!resumeArrayBuffer) { alert("Export requires the original .docx file. Please re-upload your resume."); return; }
    setExportState("generating");
    const conversationSummary = messages.map(m => `${m.role === "user" ? "User" : "Agent"}: ${m.content}`).join("\n\n");
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 3000,
          system: EXPORT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: `ORIGINAL RESUME:\n${resume}\n\nCONVERSATION LOG:\n${conversationSummary}` }],
        }),
      });
      const data = await res.json();
      const rewrittenText = data.content?.[0]?.text;
      if (!rewrittenText) throw new Error("No rewrite returned");
      setExportedText(rewrittenText);
      setExportState("downloading");
      const baseName = resumeFileName.replace(/\.(docx|doc)$/i, "");
      await patchAndDownloadDocx(resumeArrayBuffer, rewrittenText, `${baseName}-updated.docx`);
      setExportState("done");
      setTimeout(() => setExportState("idle"), 3000);
    } catch { setExportState("idle"); alert("Export failed. Please try again."); }
  };

  const loadSession = (s) => {
    setMessages(s.messages || []);
    setResume(s.resume || "");
    setJobDesc(s.jobDesc || "");
    setResumeFileName(s.resumeFileName || "");
    setPrefs(s.prefs || { tone: "professional", level: "mid", industry: "general" });
    setResumeArrayBuffer(null);
    setShowHistory(false);
    setActiveTab(MODES.CHAT);
  };

  const deleteSession = (idx) => {
    const updated = sessions.filter((_, i) => i !== idx);
    setSessions(updated); saveSessions(updated);
  };

  const clearAll = () => {
    if (messages.length > 0 || resume || jobDesc) {
      if (!window.confirm("Start a new session? This will clear your resume, job description, and conversation.")) return;
    }
    setMessages([]); setInput(""); setResume(""); setResumeArrayBuffer(null);
    setResumeFileName(""); setJobDesc(""); setFileError(""); setExportState("idle");
    setExportedText(""); setChecklist({}); setActiveTab(MODES.CHAT);
  };

  const hasResume = resume.trim().length > 0;
  const canExport = hasResume && messages.length > 0 && !!resumeArrayBuffer;
  const doneCount = Object.values(checklist).filter(Boolean).length;

  const exportLabel = { idle: "⬇ Export .docx", generating: "✦ Applying changes...", downloading: "⏳ Building...", done: "✓ Downloaded!" }[exportState];

  const tabDefs = [
    { id: MODES.CHAT, label: "💬 Chat" },
    { id: MODES.RESUME, label: "📋 Resume" },
    { id: MODES.JOB, label: "🎯 Job" },
  ];

  return (
    <div style={{ height: "100vh", background: "#0d0d0f", fontFamily: "'DM Sans', sans-serif", color: "#e8e0d4", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #3a3020; border-radius: 3px; }
        .cursor { animation: blink 0.9s step-end infinite; } @keyframes blink { 50% { opacity: 0; } }
        .msg-bubble { animation: slideUp 0.25s ease; } @keyframes slideUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        button { font-family: 'DM Sans', sans-serif; }
        textarea { resize: none; font-family: 'DM Sans', sans-serif; }
        .icon-btn { transition: all 0.18s ease; background: none; border: none; cursor: pointer; }
        .icon-btn:hover { color: #d4a853 !important; }
        .tab-btn { transition: all 0.18s; }
        .tab-btn:hover { background: rgba(212,168,83,0.1) !important; }
        .send-btn { transition: all 0.18s; }
        .send-btn:hover:not(:disabled) { background: #b8882e !important; }
        .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .suggestion-chip { transition: all 0.18s; }
        .suggestion-chip:hover { border-color: #d4a853 !important; color: #e8c97a !important; background: rgba(212,168,83,0.1) !important; }
        .followup-chip { transition: all 0.18s; }
        .followup-chip:hover { border-color: #d4a853 !important; color: #e8c97a !important; }
        .export-btn { transition: all 0.18s; }
        .export-btn:hover:not(:disabled) { background: rgba(212,168,83,0.18) !important; border-color: #d4a853 !important; }
        .export-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .upload-zone { transition: all 0.18s; }
        .upload-zone:hover { border-color: #c8a84a !important; }
      `}</style>

      {/* ── Modals ── */}
      {showSettings && <SettingsPanel prefs={prefs} onChange={setPrefs} onClose={() => setShowSettings(false)} />}
      {showHistory && <HistoryPanel sessions={sessions} onLoad={loadSession} onDelete={deleteSession} onClose={() => setShowHistory(false)} />}
      {showScore && hasResume && <ScorePanel resume={resume} jobDesc={jobDesc} onClose={() => setShowScore(false)} />}
      {showInterview && hasResume && <InterviewPanel resume={resume} jobDesc={jobDesc} onClose={() => setShowInterview(false)} />}
      {showDiff && exportedText && <DiffView original={resume} rewritten={exportedText} onClose={() => setShowDiff(false)} />}

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid #1e1c24", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0a0a0d", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #d4a853, #8b6520)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>📄</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", color: "#e8c97a", fontWeight: 600, lineHeight: 1.2 }}>Resume Strategist</div>
            <div style={{ fontSize: "0.65rem", color: "#4a3a28", letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Career Coach</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {/* Pref badges */}
          <div style={{ display: "flex", gap: "0.3rem", marginRight: "0.25rem" }}>
            {[prefs.tone, prefs.level, prefs.industry].filter(v => v !== "general" && v !== "professional" && v !== "mid").map((v, i) => (
              <span key={i} style={{ background: "rgba(212,168,83,0.1)", border: "1px solid #3a2e1a", borderRadius: 20, padding: "0.15rem 0.5rem", fontSize: "0.65rem", color: "#9a7a40" }}>{v}</span>
            ))}
          </div>
          <button className="icon-btn" onClick={() => setShowHistory(true)} title="Session History" style={{ color: "#4a3a28", fontSize: "1rem", padding: "0.3rem 0.4rem" }}>🕐</button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Preferences" style={{ color: "#4a3a28", fontSize: "1rem", padding: "0.3rem 0.4rem" }}>⚙</button>
          {hasResume && <button className="icon-btn" onClick={() => setShowScore(true)} title="Score Resume" style={{ color: "#4a3a28", fontSize: "1rem", padding: "0.3rem 0.4rem" }}>📊</button>}
          {hasResume && messages.length > 0 && <button className="icon-btn" onClick={() => setShowInterview(true)} title="Interview Prep" style={{ color: "#4a3a28", fontSize: "1rem", padding: "0.3rem 0.4rem" }}>🎤</button>}
          {exportedText && <button className="icon-btn" onClick={() => setShowDiff(true)} title="Before/After Diff" style={{ color: "#4a3a28", fontSize: "1rem", padding: "0.3rem 0.4rem" }}>⟷</button>}
          <div style={{ width: 1, height: 20, background: "#2a2420", margin: "0 0.15rem" }} />
          <button onClick={handleExport} disabled={!canExport || exportState !== "idle"} className="export-btn"
            style={{ background: exportState === "done" ? "rgba(74,122,74,0.2)" : "rgba(212,168,83,0.07)", border: `1px solid ${exportState === "done" ? "#4a7a4a" : "#3a2e1a"}`, borderRadius: 7, padding: "0.35rem 0.8rem", color: exportState === "done" ? "#5cb85c" : "#d4a853", fontSize: "0.75rem", cursor: canExport && exportState === "idle" ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
            {exportLabel}
          </button>
          <button onClick={clearAll} className="icon-btn" style={{ color: "#3a2a1a", fontSize: "0.75rem", padding: "0.3rem 0.5rem", letterSpacing: "0.04em" }}>↺ Reset</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e1c24", background: "#0a0a0d", padding: "0 1.5rem", alignItems: "center", flexShrink: 0 }}>
        {tabDefs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="tab-btn"
            style={{ padding: "0.6rem 1rem", background: "none", border: "none", borderBottom: activeTab === tab.id ? "2px solid #d4a853" : "2px solid transparent", color: activeTab === tab.id ? "#e8c97a" : "#4a3a28", cursor: "pointer", fontSize: "0.82rem", fontWeight: activeTab === tab.id ? 600 : 400, marginBottom: "-1px" }}>
            {tab.label}
          </button>
        ))}
        {/* Checklist progress */}
        {doneCount > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "#5a4a38" }}>{doneCount}/{SECTION_CHECKLIST.length} reviewed</div>
            <div style={{ width: 60, height: 4, background: "#2a2420", borderRadius: 2 }}>
              <div style={{ width: `${(doneCount / SECTION_CHECKLIST.length) * 100}%`, height: "100%", background: "linear-gradient(90deg, #d4a853, #8b6520)", borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
          </div>
        )}
        <div style={{ marginLeft: doneCount > 0 ? "0.75rem" : "auto", display: "flex", gap: "0.4rem" }}>
          {hasResume && <span style={{ background: "#1e3a1e", color: "#5cb85c", fontSize: "0.65rem", padding: "0.15rem 0.55rem", borderRadius: 20, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {resumeFileName || "Resume"}</span>}
          {jobDesc && <span style={{ background: "#1e2a3a", color: "#5b9bd5", fontSize: "0.65rem", padding: "0.15rem 0.55rem", borderRadius: 20 }}>✓ JD</span>}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Resume Tab */}
        {activeTab === MODES.RESUME && (
          <div style={{ flex: 1, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto" }}>
            <label style={{ color: "#7a6050", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Your Resume</label>
            <div className="upload-zone" onDrop={e => { e.preventDefault(); setDragOver(false); parseDocxFile(e.dataTransfer.files[0]); }} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? "#d4a853" : resumeFileName ? "#4a7a4a" : "#2a2420"}`, borderRadius: 10, padding: "1.5rem", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(212,168,83,0.05)" : resumeFileName ? "rgba(74,122,74,0.06)" : "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
              <input ref={fileInputRef} type="file" accept=".docx,.doc" style={{ display: "none" }} onChange={e => { parseDocxFile(e.target.files[0]); e.target.value = ""; }} />
              {fileLoading ? <div style={{ color: "#d4a853", fontSize: "0.85rem" }}>⏳ Reading...</div>
                : resumeFileName ? <><div style={{ fontSize: "1.5rem" }}>✅</div><div style={{ color: "#6ab86a", fontWeight: 600, fontSize: "0.85rem" }}>{resumeFileName}</div><div style={{ color: "#4a6a4a", fontSize: "0.7rem" }}>{resume.length.toLocaleString()} chars · Click to replace</div></>
                : <><div style={{ fontSize: "1.75rem" }}>📄</div><div style={{ color: "#c8a84a", fontWeight: 600, fontSize: "0.85rem" }}>Drop your .docx here</div><div style={{ color: "#4a3a28", fontSize: "0.72rem" }}>or click to browse · Format-preserving export</div></>}
            </div>
            {fileError && <div style={{ color: "#c06060", fontSize: "0.78rem", background: "rgba(192,96,96,0.08)", borderRadius: 7, padding: "0.4rem 0.7rem" }}>⚠ {fileError}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><div style={{ flex: 1, height: 1, background: "#1e1c24" }} /><span style={{ color: "#3a2e1a", fontSize: "0.68rem", letterSpacing: "0.1em" }}>OR PASTE</span><div style={{ flex: 1, height: 1, background: "#1e1c24" }} /></div>
            <textarea value={resume} onChange={e => { setResume(e.target.value); if (resumeFileName) { setResumeFileName(""); setResumeArrayBuffer(null); } }} placeholder="Paste resume text..." style={{ background: "#0e0c12", border: "1px solid #1e1c24", borderRadius: 8, padding: "0.85rem", color: "#d8d0c4", fontSize: "0.83rem", lineHeight: 1.7, outline: "none", minHeight: "22vh" }} />
            <button onClick={() => setActiveTab(MODES.CHAT)} style={{ alignSelf: "flex-end", background: "linear-gradient(135deg, #d4a853, #8b6520)", border: "none", borderRadius: 7, padding: "0.5rem 1.25rem", color: "#0d0d0f", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" }}>Done → Chat</button>
          </div>
        )}

        {/* Job Tab */}
        {activeTab === MODES.JOB && (
          <div style={{ flex: 1, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto" }}>
            <label style={{ color: "#7a6050", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Job Description</label>

            {/* URL import */}
            <div style={{ background: "#0e0c12", border: "1px solid #1e2a3a", borderRadius: 10, padding: "0.85rem 1rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#4a6a8a", marginBottom: "0.5rem", letterSpacing: "0.05em" }}>
                🔗 Import from URL — paste any job posting link
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={jobUrl}
                  onChange={e => { setJobUrl(e.target.value); setFileError(""); }}
                  onKeyDown={e => e.key === "Enter" && fetchJobUrl()}
                  placeholder="https://linkedin.com/jobs/... or indeed.com/..."
                  disabled={fetchingUrl}
                  style={{ flex: 1, background: "#141218", border: "1px solid #1e2a3a", borderRadius: 7, padding: "0.6rem 0.85rem", color: "#d8d0c4", fontSize: "0.82rem", outline: "none", opacity: fetchingUrl ? 0.6 : 1 }}
                />
                <button
                  onClick={fetchJobUrl}
                  disabled={!jobUrl.trim() || fetchingUrl}
                  style={{ background: fetchingUrl ? "rgba(91,155,213,0.08)" : "rgba(91,155,213,0.15)", border: "1px solid #1e2a3a", borderRadius: 7, padding: "0.5rem 0.85rem", color: fetchingUrl ? "#4a6a8a" : "#5b9bd5", cursor: !jobUrl.trim() || fetchingUrl ? "not-allowed" : "pointer", fontSize: "0.78rem", whiteSpace: "nowrap", opacity: !jobUrl.trim() ? 0.4 : 1 }}>
                  {fetchingUrl ? "⏳ Importing..." : "⬇ Import"}
                </button>
              </div>
              {fetchingUrl && (
                <div style={{ fontSize: "0.72rem", color: "#4a6a8a", marginTop: "0.5rem" }}>
                  Fetching page → extracting job description... this takes about 5 seconds
                </div>
              )}
              {fileError && (
                <div style={{ fontSize: "0.75rem", color: "#c06060", marginTop: "0.5rem", background: "rgba(192,96,96,0.08)", borderRadius: 6, padding: "0.4rem 0.6rem" }}>
                  ⚠ {fileError}
                </div>
              )}
              <div style={{ fontSize: "0.68rem", color: "#3a3028", marginTop: "0.5rem" }}>
                Works with most job sites. LinkedIn may require manual paste.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><div style={{ flex: 1, height: 1, background: "#1e1c24" }} /><span style={{ color: "#3a2e1a", fontSize: "0.68rem", letterSpacing: "0.1em" }}>OR PASTE MANUALLY</span><div style={{ flex: 1, height: 1, background: "#1e1c24" }} /></div>
            <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder="Paste the full job description here..." style={{ flex: 1, background: "#0e0c12", border: "1px solid #1e1c24", borderRadius: 8, padding: "0.85rem", color: "#d8d0c4", fontSize: "0.83rem", lineHeight: 1.7, outline: "none", minHeight: "40vh" }} />
            <button onClick={() => setActiveTab(MODES.CHAT)} style={{ alignSelf: "flex-end", background: "linear-gradient(135deg, #d4a853, #8b6520)", border: "none", borderRadius: 7, padding: "0.5rem 1.25rem", color: "#0d0d0f", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" }}>Done → Chat</button>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === MODES.CHAT && (
          <>
            {hasResume && (
              <div style={{ background: "rgba(74,122,74,0.08)", borderBottom: "1px solid #1a2e1a", padding: "0.35rem 1.5rem", fontSize: "0.72rem", color: "#4a8a4a", display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                ✓ Resume visible to agent{resumeFileName ? ` · ${resumeFileName}` : ""}
                {resumeArrayBuffer ? " · format-preserving export ready" : ""}
                {jobDesc ? " · job description loaded" : ""}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "1.5rem", paddingTop: "1rem" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.6rem" }}>✦</div>
                    <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.45rem", marginBottom: "0.4rem" }}>Your Resume, Perfected.</h2>
                    <p style={{ color: "#5a4a38", fontSize: "0.85rem", maxWidth: 380, lineHeight: 1.6 }}>
                      {hasResume ? "Resume loaded. Pick a starting point or ask anything." : "Upload your resume in the Resume tab, then start here."}
                    </p>
                  </div>
                  {/* Feature pills */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 480 }}>
                    {[
                      { icon: "📊", label: "Score Resume", action: () => hasResume ? setShowScore(true) : setActiveTab(MODES.RESUME) },
                      { icon: "🎤", label: "Interview Prep", action: () => hasResume ? setShowInterview(true) : setActiveTab(MODES.RESUME) },
                      { icon: "⚙", label: "Set Preferences", action: () => setShowSettings(true) },
                      { icon: "🕐", label: "Past Sessions", action: () => setShowHistory(true) },
                    ].map((f, i) => (
                      <button key={i} onClick={f.action} className="suggestion-chip"
                        style={{ background: "rgba(212,168,83,0.05)", border: "1px solid #2a2420", borderRadius: 20, padding: "0.4rem 0.85rem", color: "#6a5a40", cursor: "pointer", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <span>{f.icon}</span><span>{f.label}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", justifyContent: "center", maxWidth: 520 }}>
                    {["Tailor my resume for this job", "Rewrite bullet points with stronger impact", "Optimize for ATS", "Review my summary section", "Help quantify my achievements", "Identify gaps in my resume"].map((s, i) => (
                      <button key={i} onClick={() => sendMessage(s)} className="suggestion-chip"
                        style={{ background: "rgba(212,168,83,0.04)", border: "1px solid #2a2420", borderRadius: 20, padding: "0.4rem 0.9rem", color: "#7a6a50", cursor: "pointer", fontSize: "0.78rem" }}>{s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const isAssistant = msg.role === "assistant";

                // Parse follow-ups out of assistant messages
                let mainContent = msg.content;
                let followUps = [];
                if (isAssistant) {
                  const fuMatch = msg.content.match(/\*\*Follow-ups?:\*\*([\s\S]*?)$/i);
                  if (fuMatch) {
                    mainContent = msg.content.slice(0, fuMatch.index).trim();
                    followUps = fuMatch[1].trim().split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
                  }
                }

                return (
                  <div key={i} className="msg-bubble">
                    <div style={{ display: "flex", justifyContent: isAssistant ? "flex-start" : "flex-end", gap: "0.6rem", alignItems: "flex-start" }}>
                      {isAssistant && <div style={{ width: 28, height: 28, flexShrink: 0, background: "linear-gradient(135deg, #d4a853, #8b6520)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, marginTop: 3 }}>✦</div>}
                      <div style={{ maxWidth: isAssistant ? "84%" : "68%", background: isAssistant ? "#0e0c14" : "linear-gradient(135deg, #1e1608, #181208)", border: `1px solid ${isAssistant ? "#1e1c28" : "#3a2e18"}`, borderRadius: isAssistant ? "4px 14px 14px 14px" : "14px 4px 14px 14px", padding: isAssistant ? "1rem 1.25rem" : "0.7rem 0.95rem" }}>
                        {isAssistant && isLast ? <TypewriterText text={mainContent} />
                          : isAssistant ? formatMessage(mainContent)
                          : <span style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem", color: "#d8d0c4", lineHeight: 1.65 }}>{msg.content}</span>}
                      </div>
                    </div>
                    {/* Follow-up chips below assistant message */}
                    {isAssistant && followUps.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem", marginLeft: "2.4rem" }}>
                        {followUps.map((fu, j) => (
                          <button key={j} onClick={() => sendMessage(fu)} className="followup-chip"
                            style={{ background: "rgba(212,168,83,0.06)", border: "1px solid #2a2218", borderRadius: 20, padding: "0.3rem 0.75rem", color: "#7a6840", cursor: "pointer", fontSize: "0.75rem" }}>
                            {fu}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #d4a853, #8b6520)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✦</div>
                  <div style={{ background: "#0e0c14", border: "1px solid #1e1c28", borderRadius: "4px 14px 14px 14px", padding: "0.85rem 1.1rem", display: "flex", gap: 5, alignItems: "center" }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, background: "#d4a853", borderRadius: "50%", animation: `blink 1.2s ${i*0.2}s ease-in-out infinite`, opacity: 0.6 }} />)}
                  </div>
                </div>
              )}

              {/* Export nudge */}
              {messages.length >= 4 && canExport && exportState === "idle" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ background: "rgba(212,168,83,0.04)", border: "1px dashed #2a2418", borderRadius: 10, padding: "0.6rem 1rem", fontSize: "0.75rem", color: "#5a4a30", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span>Ready to export?</span>
                    <button onClick={handleExport} style={{ background: "linear-gradient(135deg, #d4a853, #8b6520)", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", color: "#0d0d0f", fontWeight: 600, cursor: "pointer", fontSize: "0.75rem" }}>Export .docx</button>
                    {exportedText && <button onClick={() => setShowDiff(true)} style={{ background: "rgba(212,168,83,0.1)", border: "1px solid #3a2e1a", borderRadius: 6, padding: "0.3rem 0.75rem", color: "#d4a853", cursor: "pointer", fontSize: "0.75rem" }}>View Diff</button>}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: "1px solid #1e1c24", padding: "0.85rem 1.5rem", background: "#0a0a0d", display: "flex", gap: "0.6rem", alignItems: "flex-end", flexShrink: 0 }}>
              <textarea ref={textareaRef} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px"; }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={hasResume ? "Ask me to tailor, rewrite, score, or improve your resume..." : "Ask anything, or upload your resume first..."}
                rows={1}
                style={{ flex: 1, background: "#0e0c12", border: "1px solid #2a2418", borderRadius: 10, padding: "0.7rem 0.9rem", color: "#d8d0c4", fontSize: "0.86rem", outline: "none", lineHeight: 1.6, maxHeight: 130, overflow: "auto" }}
              />
              <button onClick={() => sendMessage()} disabled={!input.trim() || loading} className="send-btn"
                style={{ background: "linear-gradient(135deg, #d4a853, #8b6520)", border: "none", borderRadius: 9, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 17, flexShrink: 0 }}>→</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
