const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ROOT = __dirname;
const MAX_BODY = 12 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error("Upload is too large. Use a file under 8 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = path.normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const type = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
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

async function callPrescriptionModel(upload) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not set.");
    error.statusCode = 503;
    throw error;
  }

  const isImage = upload.mimeType && upload.mimeType.startsWith("image/");
  const isPdf = upload.mimeType === "application/pdf" || upload.name.toLowerCase().endsWith(".pdf");

  if (!isImage && !isPdf) {
    const error = new Error("Upload an image or PDF prescription for AI reading.");
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
        "You extract medicine instructions from prescription images or PDFs.",
        "Do not diagnose. Do not recommend changing treatment.",
        "Return JSON only. If a field is unclear, use null and include it in uncertainFields."
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Read this prescription and extract only visible information.",
                "Return JSON with keys: rawText, medicines, uncertainFields, safetyNotes.",
                "medicines must be an array of objects with name, dose, frequency, timing, duration, instructions.",
                "Use plain English. Mark illegible handwriting as uncertain."
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
    warning: "AI extraction can misread handwriting, abbreviations, or poor scans. Verify medicines with a clinician or pharmacist."
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/read-prescription") {
    try {
      const body = await readBody(req);
      const upload = JSON.parse(body);
      if (!upload.name || !upload.mimeType || !upload.dataUrl) {
        sendJson(res, 400, { error: "Missing upload data." });
        return;
      }
      sendJson(res, 200, await callPrescriptionModel(upload));
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message || "Unable to read prescription." });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`HealthLens running at http://localhost:${PORT}/`);
  console.log(`AI prescription reader: ${process.env.OPENAI_API_KEY ? `enabled with ${MODEL}` : "set OPENAI_API_KEY to enable"}`);
});
