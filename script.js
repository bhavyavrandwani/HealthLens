const state = {
  medicines: 0,
  reportFlags: 0,
  vitals: "Waiting",
  rxPlain: "",
  reportPlain: ""
};

const refs = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  rxInput: document.querySelector("#rxInput"),
  rxOutput: document.querySelector("#rxOutput"),
  rxConfidence: document.querySelector("#rxConfidence"),
  rxUpload: document.querySelector("#rxUpload"),
  uploadPreview: document.querySelector("#uploadPreview"),
  readUploadedRx: document.querySelector("#readUploadedRx"),
  reportInput: document.querySelector("#reportInput"),
  reportOutput: document.querySelector("#reportOutput"),
  reportConfidence: document.querySelector("#reportConfidence"),
  reportUpload: document.querySelector("#reportUpload"),
  reportUploadPreview: document.querySelector("#reportUploadPreview"),
  readUploadedReport: document.querySelector("#readUploadedReport"),
  snapshot: document.querySelector("#snapshot"),
  age: document.querySelector("#age"),
  context: document.querySelector("#context"),
  vitalsOutput: document.querySelector("#vitalsOutput")
};

const sampleRx = `Tab Metformin 500 mg twice daily after food for 30 days
Cap Omeprazole 20 mg once daily before breakfast for 14 days
Tab Paracetamol 500 mg every 6 hours if fever, max 4 tablets per day
Drink plenty of water and review after 2 weeks`;

const sampleReport = `Hemoglobin 10.8 g/dL
WBC 6200 cells/uL
Platelets 180000
Fasting glucose 132 mg/dL
Total cholesterol 224 mg/dL
HDL 38 mg/dL
LDL 142 mg/dL
TSH 5.8 mIU/L`;

let uploadedPrescription = null;
let uploadedReport = null;

const reportRules = [
  { key: "hemoglobin", names: ["hemoglobin", "hb"], unit: "g/dL", low: 12, high: 16.5, plain: "oxygen-carrying blood protein" },
  { key: "wbc", names: ["wbc", "white blood cell", "white blood cells"], unit: "cells/uL", low: 4000, high: 11000, plain: "infection-fighting cells" },
  { key: "platelets", names: ["platelet", "platelets"], unit: "cells/uL", low: 150000, high: 450000, plain: "blood clotting cells" },
  { key: "fasting glucose", names: ["fasting glucose", "fbs", "fasting blood sugar"], unit: "mg/dL", low: 70, high: 99, plain: "fasting blood sugar" },
  { key: "total cholesterol", names: ["total cholesterol", "cholesterol"], unit: "mg/dL", low: 125, high: 200, plain: "total blood fats" },
  { key: "hdl", names: ["hdl"], unit: "mg/dL", low: 40, high: 90, plain: "protective cholesterol" },
  { key: "ldl", names: ["ldl"], unit: "mg/dL", low: 0, high: 100, plain: "artery-clogging cholesterol" },
  { key: "tsh", names: ["tsh"], unit: "mIU/L", low: 0.4, high: 4.5, plain: "thyroid control hormone" },
  { key: "creatinine", names: ["creatinine"], unit: "mg/dL", low: 0.6, high: 1.3, plain: "kidney filtration marker" },
  { key: "vitamin d", names: ["vitamin d", "25-oh vitamin d"], unit: "ng/mL", low: 30, high: 100, plain: "vitamin D level" }
];

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function updateSnapshot() {
  refs.snapshot.innerHTML = `
    <div><dt>Medicines</dt><dd>${state.medicines}</dd></div>
    <div><dt>Report flags</dt><dd>${state.reportFlags}</dd></div>
    <div><dt>Vitals</dt><dd>${state.vitals}</dd></div>
  `;
}

function setEmpty(target, message) {
  target.className = "result-list empty-state";
  target.textContent = message;
}

function setResults(target, html) {
  target.className = "result-list";
  target.innerHTML = html;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

function renderAiMedicines(medicines) {
  if (!Array.isArray(medicines) || !medicines.length) return "";
  return medicines.map((med) => {
    const name = med.name || "Medicine";
    const dose = med.dose || "Dose not detected";
    const frequency = med.frequency || "frequency not detected";
    const timing = med.timing || "timing not detected";
    const duration = med.duration || "Duration not detected";
    const instructions = med.instructions || med.notes || "";
    return `${name} ${dose} ${frequency} ${timing} ${duration}${instructions ? ` ${instructions}` : ""}`;
  }).join("\n");
}

function setAiStatus(status, message) {
  refs.rxConfidence.textContent = status;
  setResults(refs.rxOutput, `
    <article class="result-card warn">
      <h3>${escapeHtml(status)}</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `);
}

function setReportAiStatus(status, message) {
  refs.reportConfidence.textContent = status;
  setResults(refs.reportOutput, `
    <article class="result-card warn">
      <h3>${escapeHtml(status)}</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `);
}

async function handleUpload(fileInput, preview, setUploaded) {
  const file = fileInput.files[0];
  setUploaded(null);

  if (!file) {
    preview.textContent = "No file selected";
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    fileInput.value = "";
    preview.textContent = "Choose a file under 8 MB.";
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  setUploaded({
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl
  });

  if (file.type.startsWith("image/")) {
    preview.innerHTML = `<img src="${dataUrl}" alt="Uploaded file preview">`;
    return;
  }

  preview.textContent = `${file.name} selected. ${file.type || "Unknown file type"}`;
}

async function handlePrescriptionUpload() {
  await handleUpload(refs.rxUpload, refs.uploadPreview, (value) => {
    uploadedPrescription = value;
  });
}

async function handleReportUpload() {
  await handleUpload(refs.reportUpload, refs.reportUploadPreview, (value) => {
    uploadedReport = value;
  });
}

async function readUploadedPrescriptionWithAi() {
  const file = refs.rxUpload.files[0];
  if (!file || !uploadedPrescription) {
    setAiStatus("Upload needed", "Choose a prescription image, PDF, or text file first.");
    return;
  }

  refs.readUploadedRx.disabled = true;
  refs.readUploadedRx.textContent = "Reading...";
  refs.rxConfidence.textContent = "AI reading";

  try {
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      refs.rxInput.value = await readFileAsText(file);
      analyzePrescription();
      return;
    }

    const response = await fetch("/api/read-prescription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploadedPrescription)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The AI reader is not available.");
    }

    const extracted = payload.rawText || renderAiMedicines(payload.medicines);
    refs.rxInput.value = extracted.trim();
    analyzePrescription();
    refs.rxConfidence.textContent = payload.model ? `AI: ${payload.model}` : "AI read";

    if (payload.warning) {
      setResults(refs.rxOutput, refs.rxOutput.innerHTML + `
        <article class="result-card warn">
          <h3>AI reader note</h3>
          <p>${escapeHtml(payload.warning)}</p>
        </article>
      `);
    }
  } catch (error) {
    setAiStatus("AI unavailable", `${error.message} Start the Node server with an OpenAI API key to read image or PDF prescriptions.`);
  } finally {
    refs.readUploadedRx.disabled = false;
    refs.readUploadedRx.textContent = "Read uploaded prescription with AI";
  }
}

function renderAiReportValues(values) {
  if (!Array.isArray(values) || !values.length) return "";
  return values.map((item) => {
    const name = item.name || item.test || "Test";
    const value = item.value ?? "";
    const unit = item.unit || "";
    return `${name} ${value} ${unit}`.trim();
  }).join("\n");
}

async function readUploadedReportWithAi() {
  const file = refs.reportUpload.files[0];
  if (!file || !uploadedReport) {
    setReportAiStatus("Upload needed", "Choose a diagnostic report image, PDF, or text file first.");
    return;
  }

  refs.readUploadedReport.disabled = true;
  refs.readUploadedReport.textContent = "Extracting...";
  refs.reportConfidence.textContent = "AI reading";

  try {
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      refs.reportInput.value = await readFileAsText(file);
      analyzeReport();
      return;
    }

    const response = await fetch("/api/read-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploadedReport)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The AI report reader is not available.");
    }

    const extracted = payload.rawText || renderAiReportValues(payload.values);
    refs.reportInput.value = extracted.trim();
    analyzeReport();
    refs.reportConfidence.textContent = payload.model ? `AI: ${payload.model}` : "AI read";

    if (payload.summary || payload.warning) {
      setResults(refs.reportOutput, refs.reportOutput.innerHTML + `
        <article class="result-card warn">
          <h3>AI reader note</h3>
          <p>${escapeHtml([payload.summary, payload.warning].filter(Boolean).join(" "))}</p>
        </article>
      `);
    }
  } catch (error) {
    setReportAiStatus("AI unavailable", `${error.message} Add OPENAI_API_KEY in Vercel to read uploaded report images or PDFs.`);
  } finally {
    refs.readUploadedReport.disabled = false;
    refs.readUploadedReport.textContent = "Extract report values with AI";
  }
}

function parsePrescription(text) {
  const lines = text.split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const medicineLines = lines.filter((line) => /\b(tab|tablet|cap|capsule|syrup|inj|injection|drop|cream|ointment)\b/i.test(line));

  return medicineLines.map((line) => {
    const clean = line.replace(/\s+/g, " ");
    const nameMatch = clean.match(/\b(?:tab|tablet|cap|capsule|syrup|inj|injection|drop|cream|ointment)\.?\s+([a-z][a-z0-9 -]+)/i);
    const doseMatch = clean.match(/(\d+(?:\.\d+)?)\s?(mg|mcg|g|ml|iu|units|%)\b/i);
    const durationMatch = clean.match(/\bfor\s+(\d+\s+(?:day|days|week|weeks|month|months))\b/i);
    const frequency = detectFrequency(clean);
    const timing = detectTiming(clean);
    const caution = detectCaution(clean);

    return {
      source: clean,
      name: nameMatch ? nameMatch[1].split(/\s+(?:\d|once|twice|daily|after|before|every|for)\b/i)[0].trim() : "Medicine",
      dose: doseMatch ? `${doseMatch[1]} ${doseMatch[2]}` : "Dose not detected",
      frequency,
      timing,
      duration: durationMatch ? durationMatch[1] : "Duration not detected",
      caution
    };
  });
}

function detectFrequency(text) {
  const value = text.toLowerCase();
  if (/\bonce daily|\bod\b/.test(value)) return "once daily";
  if (/\btwice daily|\bbd\b|\bbid\b/.test(value)) return "twice daily";
  if (/\bthree times|\btds\b|\btid\b/.test(value)) return "three times daily";
  if (/\bfour times|\bqid\b/.test(value)) return "four times daily";
  const hourly = value.match(/\bevery\s+(\d+)\s*(hour|hours|hr|hrs)\b/);
  if (hourly) return `every ${hourly[1]} hours`;
  if (/\bif needed|\bprn|\bif fever|\bfor pain\b/.test(value)) return "only if needed";
  return "frequency not detected";
}

function detectTiming(text) {
  const value = text.toLowerCase();
  if (/before food|before meal|before breakfast|empty stomach/.test(value)) return "before food";
  if (/after food|after meal|with food/.test(value)) return "after food";
  if (/bedtime|at night|night/.test(value)) return "night";
  if (/morning/.test(value)) return "morning";
  return "timing not detected";
}

function detectCaution(text) {
  const value = text.toLowerCase();
  const cautions = [];
  if (/paracetamol|acetaminophen/.test(value)) cautions.push("Avoid duplicate fever/pain medicines with the same ingredient.");
  if (/metformin/.test(value)) cautions.push("Take with meals unless your clinician says otherwise.");
  if (/omeprazole|pantoprazole/.test(value)) cautions.push("Usually taken before food for best effect.");
  if (/antibiotic|amoxicillin|azithromycin|doxycycline/.test(value)) cautions.push("Complete the prescribed course unless your clinician changes it.");
  if (/insulin|warfarin|steroid|prednisolone/.test(value)) cautions.push("Do not change dose without medical supervision.");
  return cautions;
}

function analyzePrescription() {
  const medicines = parsePrescription(refs.rxInput.value);
  if (!refs.rxInput.value.trim()) {
    state.medicines = 0;
    state.rxPlain = "";
    refs.rxConfidence.textContent = "No input";
    setEmpty(refs.rxOutput, "Paste prescription text to build a simple medication schedule.");
    updateSnapshot();
    return;
  }

  if (!medicines.length) {
    state.medicines = 0;
    state.rxPlain = "";
    refs.rxConfidence.textContent = "Needs review";
    setEmpty(refs.rxOutput, "No medication pattern was detected. Try including medicine form, dose, timing, and duration.");
    updateSnapshot();
    return;
  }

  state.medicines = medicines.length;
  refs.rxConfidence.textContent = `${medicines.length} detected`;
  state.rxPlain = medicines.map((med, index) => (
    `${index + 1}. ${titleCase(med.name)}: ${med.dose}, ${med.frequency}, ${med.timing}, ${med.duration}. ${med.caution.join(" ")}`
  )).join("\n");
  setResults(refs.rxOutput, medicines.map((med) => `
    <article class="result-card ${med.dose.includes("not detected") || med.frequency.includes("not detected") || med.timing.includes("not detected") || med.duration.includes("not detected") ? "warn" : ""}">
      <h3>${escapeHtml(titleCase(med.name))}</h3>
      <p>${escapeHtml(med.dose)} - ${escapeHtml(med.frequency)} - ${escapeHtml(med.timing)} - ${escapeHtml(med.duration)}</p>
      <div class="meta-row">
        <span class="chip">Source checked</span>
        <span class="chip">${escapeHtml(med.frequency)}</span>
        <span class="chip">${escapeHtml(med.timing)}</span>
      </div>
      ${med.caution.length ? `<p class="advice">${escapeHtml(med.caution.join(" "))}</p>` : ""}
    </article>
  `).join("") + `
    <article class="result-card warn">
      <h3>Before taking medicine</h3>
      <p>Confirm allergies, pregnancy status, kidney or liver disease, and interactions with a pharmacist or doctor. Do not stop or change doses based on this screen alone.</p>
    </article>
  `);
  updateSnapshot();
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function findMetric(text, rule) {
  for (const name of rule.names) {
    const pattern = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\D{0,25}(-?\\d+(?:\\.\\d+)?)`, "i");
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function analyzeReport() {
  const text = refs.reportInput.value;
  const findings = reportRules
    .map((rule) => ({ rule, value: findMetric(text, rule) }))
    .filter((item) => item.value !== null)
    .map(({ rule, value }) => {
      let status = "normal";
      let severity = "";
      if (value < rule.low) {
        status = "low";
        severity = "warn";
      }
      if (value > rule.high) {
        status = "high";
        severity = "warn";
      }
      if ((rule.key === "fasting glucose" && value >= 126) || (rule.key === "ldl" && value >= 190)) {
        severity = "danger";
      }
      return { rule, value, status, severity };
    });

  if (!text.trim()) {
    state.reportFlags = 0;
    state.reportPlain = "";
    refs.reportConfidence.textContent = "No input";
    setEmpty(refs.reportOutput, "Paste diagnostic report values to see plain-language explanations.");
    updateSnapshot();
    return;
  }

  if (!findings.length) {
    state.reportFlags = 0;
    state.reportPlain = "";
    refs.reportConfidence.textContent = "Needs review";
    setEmpty(refs.reportOutput, "No supported values were detected. Include labels such as hemoglobin, glucose, HDL, LDL, TSH, WBC, or platelets.");
    updateSnapshot();
    return;
  }

  state.reportFlags = findings.filter((item) => item.status !== "normal").length;
  refs.reportConfidence.textContent = `${findings.length} values found`;
  state.reportPlain = findings.map(({ rule, value, status }) => (
    `${titleCase(rule.key)}: ${value} ${rule.unit}. Status: ${status}. Usual range: ${rule.low}-${rule.high}.`
  )).join("\n");
  setResults(refs.reportOutput, findings.map(({ rule, value, status, severity }) => `
    <article class="result-card ${severity}">
      <h3>${titleCase(rule.key)}: ${value} ${rule.unit}</h3>
      <p>${status === "normal" ? "This is within the usual adult reference range for many labs." : `This looks ${status} compared with a common adult reference range.`} ${titleCase(rule.plain)} can vary by age, sex, pregnancy, medicines, and lab method.</p>
      <div class="meta-row">
        <span class="chip">Usual range: ${rule.low}-${rule.high}</span>
        <span class="chip">${status}</span>
      </div>
    </article>
  `).join("") + `
    <article class="result-card">
      <h3>Next step</h3>
      <p>Use these explanations to prepare questions. A clinician should interpret patterns, symptoms, and repeat testing needs.</p>
    </article>
  `);
  updateSnapshot();
}

function analyzeVitals() {
  const age = Number(refs.age.value) || 30;
  const context = refs.context.value;
  const heartRate = Number(document.querySelector("#heartRate").value);
  const systolic = Number(document.querySelector("#systolic").value);
  const diastolic = Number(document.querySelector("#diastolic").value);
  const oxygen = Number(document.querySelector("#oxygen").value);
  const temperature = Number(document.querySelector("#temperature").value);
  const findings = [];

  const restingRange = age < 12 ? [70, 120] : [60, 100];
  if (context === "exercise") {
    findings.push(card("Heart rate", `${heartRate} bpm`, "Exercise can raise heart rate. It should trend down during recovery.", "normal"));
  } else if (heartRate < restingRange[0]) {
    findings.push(card("Heart rate", `${heartRate} bpm`, "This is lower than a common resting range. Seek care if you feel dizzy, faint, weak, or short of breath.", "warn"));
  } else if (heartRate > restingRange[1]) {
    findings.push(card("Heart rate", `${heartRate} bpm`, "This is higher than a common resting range. Recheck after resting quietly for 5 minutes.", heartRate > 130 ? "danger" : "warn"));
  } else {
    findings.push(card("Heart rate", `${heartRate} bpm`, "This is within a common resting range.", "normal"));
  }

  let bpSeverity = "normal";
  let bpText = "Blood pressure is in a commonly healthy range.";
  if (systolic >= 180 || diastolic >= 120) {
    bpSeverity = "danger";
    bpText = "This can be a hypertensive crisis range. Seek urgent medical advice, especially with symptoms.";
  } else if (systolic >= 140 || diastolic >= 90) {
    bpSeverity = "warn";
    bpText = "This is in a high range. Recheck and discuss repeated readings with a clinician.";
  } else if (systolic < 90 || diastolic < 60) {
    bpSeverity = "warn";
    bpText = "This is low for many adults. Symptoms matter: dizziness, fainting, or weakness needs attention.";
  }
  findings.push(card("Blood pressure", `${systolic}/${diastolic} mmHg`, bpText, bpSeverity));

  findings.push(card(
    "Oxygen",
    `${oxygen}%`,
    oxygen < 90 ? "This is low and may need urgent care." : oxygen < 95 ? "This is slightly low for many people. Recheck and consider medical advice." : "This is within a common range.",
    oxygen < 90 ? "danger" : oxygen < 95 ? "warn" : "normal"
  ));

  findings.push(card(
    "Temperature",
    `${temperature.toFixed(1)} F`,
    temperature >= 100.4 ? "This is a fever range. Hydration, symptoms, and duration matter." : temperature < 95 ? "This is unusually low. Recheck the thermometer and seek care if confirmed." : "This is within a common range.",
    temperature >= 103 || temperature < 95 ? "danger" : temperature >= 100.4 ? "warn" : "normal"
  ));

  const dangerCount = findings.filter((item) => item.severity === "danger").length;
  const warnCount = findings.filter((item) => item.severity === "warn").length;
  state.vitals = dangerCount ? "Urgent" : warnCount ? "Review" : "Stable";
  refs.vitalsOutput.innerHTML = findings.map((item) => item.html).join("");
  updateSnapshot();
}

function card(title, value, body, severity) {
  return {
    severity,
    html: `
      <article class="result-card ${severity === "normal" ? "" : severity}">
        <h3>${escapeHtml(title)}: ${escapeHtml(value)}</h3>
        <p>${escapeHtml(body)}</p>
      </article>
    `
  };
}

async function copyText(button, getText, fallback) {
  const text = getText().trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(`${text}\n\n${fallback}`);
    const original = button.textContent;
    button.textContent = "Copied";
    button.classList.add("copy-ready");
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copy-ready");
    }, 1200);
  } catch {
    window.alert("Copy is unavailable in this browser.");
  }
}

refs.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    refs.tabs.forEach((item) => item.classList.toggle("active", item === tab));
    refs.panels.forEach((panel) => panel.classList.toggle("active", panel.id === tab.dataset.tab));
  });
});

document.querySelector("#loadSampleRx").addEventListener("click", () => {
  refs.rxInput.value = sampleRx;
  analyzePrescription();
});
refs.rxUpload.addEventListener("change", handlePrescriptionUpload);
refs.readUploadedRx.addEventListener("click", readUploadedPrescriptionWithAi);
document.querySelector("#clearRx").addEventListener("click", () => {
  refs.rxInput.value = "";
  refs.rxUpload.value = "";
  uploadedPrescription = null;
  refs.uploadPreview.textContent = "No file selected";
  analyzePrescription();
});
document.querySelector("#analyzeRx").addEventListener("click", analyzePrescription);
document.querySelector("#copyRx").addEventListener("click", (event) => {
  copyText(event.currentTarget, () => state.rxPlain, "Verify all medicines with your doctor or pharmacist before making changes.");
});

document.querySelector("#loadSampleReport").addEventListener("click", () => {
  refs.reportInput.value = sampleReport;
  analyzeReport();
});
refs.reportUpload.addEventListener("change", handleReportUpload);
refs.readUploadedReport.addEventListener("click", readUploadedReportWithAi);
document.querySelector("#clearReport").addEventListener("click", () => {
  refs.reportInput.value = "";
  refs.reportUpload.value = "";
  uploadedReport = null;
  refs.reportUploadPreview.textContent = "No file selected";
  analyzeReport();
});
document.querySelector("#analyzeReport").addEventListener("click", analyzeReport);
document.querySelector("#copyReport").addEventListener("click", (event) => {
  copyText(event.currentTarget, () => state.reportPlain, "Reference ranges vary by lab and patient context. Review abnormal or repeated flags with a clinician.");
});

document.querySelectorAll("#vitalsForm input, #age, #context").forEach((input) => {
  input.addEventListener("input", analyzeVitals);
  input.addEventListener("change", analyzeVitals);
});

updateSnapshot();
analyzeVitals();
