const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_BODY = 12 * 1024 * 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response did not contain JSON.");
  return JSON.parse(match[0]);
}

function getBase64Payload(dataUrl) {
  return dataUrl.includes(",") ? dataUrl.split(",").pop() : dataUrl;
}

async function callReportModel(upload) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not set.");
    error.statusCode = 503;
    throw error;
  }

  const isImage = upload.mimeType && upload.mimeType.startsWith("image/");
  const isPdf = upload.mimeType === "application/pdf" || upload.name.toLowerCase().endsWith(".pdf");

  if (!isImage && !isPdf) {
    const error = new Error("Upload an image or PDF report for AI reading.");
    error.statusCode = 400;
    throw error;
  }

  const fileContent = isImage
    ? { type: "input_image", image_url: upload.dataUrl, detail: "high" }
    : { type: "input_file", filename: upload.name, file_data: getBase64Payload(upload.dataUrl) };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: [
        "You extract visible lab and diagnostic report values from images or PDFs.",
        "Do not diagnose. Do not recommend treatment changes.",
        "Return JSON only. If text is unclear, use null and mention it in uncertainFields."
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Read this diagnostic report and extract only visible test values.",
                "Return JSON with keys: rawText, values, summary, uncertainFields, safetyNotes.",
                "values must be an array of objects with name, value, unit, referenceRange, flag.",
                "Keep rawText compact but include common labels such as hemoglobin, WBC, platelets, fasting glucose, cholesterol, HDL, LDL, TSH, creatinine, vitamin D when visible."
              ].join(" ")
            },
            fileContent
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI request failed.");
    error.statusCode = response.status;
    throw error;
  }

  const outputText = data.output_text || data.output?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n");

  if (!outputText) {
    const error = new Error("AI response did not include text output.");
    error.statusCode = 502;
    throw error;
  }

  return {
    ...extractJson(outputText),
    model: MODEL,
    warning: "AI extraction can misread scans, units, or reference ranges. Confirm abnormal values with a clinician."
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const size = Number(req.headers["content-length"] || 0);
    if (size > MAX_BODY) {
      sendJson(res, 413, { error: "Upload is too large. Use a file under 8 MB." });
      return;
    }

    const upload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!upload?.name || !upload?.mimeType || !upload?.dataUrl) {
      sendJson(res, 400, { error: "Missing upload data." });
      return;
    }

    sendJson(res, 200, await callReportModel(upload));
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Unable to read report." });
  }
};
