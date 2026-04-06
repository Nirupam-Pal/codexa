// lib/piston.js

const PISTON_BASE_URL = process.env.PISTON_API_URL || "http://localhost:2000";

const PISTON_LANGUAGE_MAP = {
  JAVASCRIPT: { language: "node",       version: "18.15.0" }, // CHANGED: "javascript" → "node"
  PYTHON:     { language: "python",     version: "3.12.0"  }, // CHANGED: 3.10.0 → 3.12.0
  JAVA:       { language: "java",       version: "15.0.2"  },
  CPP:        { language: "gcc",        version: "10.2.0"  }, // CHANGED: "c++" → "gcc"
  C:          { language: "gcc",        version: "10.2.0"  }, // CHANGED: "c" → "gcc"
  TYPESCRIPT: { language: "typescript", version: "5.0.3"   },
  GO:         { language: "go",         version: "1.16.2"  },
  RUST:       { language: "rust",       version: "1.68.2"  }, // CHANGED: 1.50.0 → 1.68.2
};

export function getPistonLanguage(language) {
  return PISTON_LANGUAGE_MAP[language.toUpperCase()] ?? null;
}

export async function executePiston(language, version, sourceCode, stdin = "") {
  const res = await fetch(`${PISTON_BASE_URL}/api/v2/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language,
      version,
      files: [{ content: sourceCode }],
      stdin,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Piston error: ${res.status} - ${err}`);
  }

  return res.json();
}

export async function getPistonRuntimes() {
  const res = await fetch(`${PISTON_BASE_URL}/api/v2/runtimes`);
  return res.json();
}