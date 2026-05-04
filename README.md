# HealthLabs

HealthLabs is a static web prototype for helping users understand common health documents and readings in plain language.

## What It Does

- Uploads prescription images, PDFs, or text files.
- Reads uploaded prescriptions with a vision-capable OpenAI model when the local Node server has `OPENAI_API_KEY` configured.
- Uploads diagnostic report images, PDFs, or text files and extracts common values with AI on Vercel.
- Interprets pasted prescription text into medicine, dose, frequency, timing, duration, and caution cards.
- Groups medicines into a simple daily schedule and highlights missing or duplicate details for verification.
- Simplifies common diagnostic report values such as hemoglobin, WBC, platelets, glucose, cholesterol, HDL, LDL, TSH, creatinine, and vitamin D.
- Analyzes basic health indicators including heart rate, blood pressure, oxygen saturation, and temperature.
- Provides copyable plain-language summaries for medication plans and lab interpretations.
- Includes privacy and safety notices around AI document reading.
- Keeps safety boundaries visible: it supports understanding, but does not diagnose or change treatment.

## Run Locally

Open `index.html` directly in a browser for the static-only version, or run the Node server to enable AI upload reading:

```bash
OPENAI_API_KEY=your_key_here node server.js
```

Then visit:

```text
http://localhost:4173/
```

Optional model override:

```bash
OPENAI_MODEL=gpt-4.1-mini OPENAI_API_KEY=your_key_here node server.js
```

## Deploy On Vercel

This project is Vercel-ready. Static files are served from the project root. AI readers are available as `api/read-prescription.js` and `api/read-report.js`.

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New Project** and import that repository.
3. Use these project settings:

```text
Framework Preset: Other
Build Command: None
Output Directory: .
Install Command: None
```

4. Add environment variables in Vercel Project Settings:

```text
OPENAI_API_KEY=your OpenAI API key
OPENAI_MODEL=gpt-4.1-mini
```

5. Deploy. The Vercel URL replaces `http://localhost:4173/`.

CLI alternative:

```bash
npm i -g vercel
vercel
vercel env add OPENAI_API_KEY
vercel env add OPENAI_MODEL
vercel --prod
```

## Important Safety Note

This app is educational decision support only. Users should follow licensed medical guidance, verify prescriptions with a doctor or pharmacist, and seek urgent care for severe symptoms or emergency-range readings.
