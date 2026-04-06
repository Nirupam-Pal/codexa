// app/api/.../route.js
// MIGRATED: Judge0 → Piston API
// Piston docs: https://github.com/engineer-man/piston
// Public endpoint: https://emkc.org/api/v2/piston

import { getPistonLanguage } from "@/lib/piston"; // CHANGED: replaces getJudge0LanguageId
import { currentUserRole, getCurrentUser } from "@/modules/auth/actions";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// CHANGED: Piston executes synchronously — no batch/polling needed
async function executePiston(language, version, sourceCode, stdin) {
  const response = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language,
      version,
      files: [{ content: sourceCode }],
      stdin: stdin ?? "",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Piston API error: ${response.status} - ${err}`);
  }

  return response.json();
  // Returns: { language, version, run: { stdout, stderr, code, signal, output } }
}

export async function POST(request) {
  try {
    const userRole = await currentUserRole();
    const user = await getCurrentUser();

    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const {
      title,
      description,
      difficulty,
      tags,
      examples,
      constraints,
      testCases,
      codeSnippets,
      referenceSolutions,
    } = body;

    // Basic validation (UNCHANGED)
    if (!title || !description || !difficulty || !testCases || !codeSnippets || !referenceSolutions) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json(
        { error: "At least one test case is required" },
        { status: 400 }
      );
    }

    if (!referenceSolutions || typeof referenceSolutions !== "object") {
      return NextResponse.json(
        { error: "Reference solutions must be provided for all supported languages" },
        { status: 400 }
      );
    }

    // Step 2: Validate all reference solutions using Piston
    for (const [language, solutionCode] of Object.entries(referenceSolutions)) {
      
      // CHANGED: getPistonLanguage returns { language, version } instead of a numeric ID
      const pistonLang = getPistonLanguage(language);
      if (!pistonLang) {
        return NextResponse.json(
          { error: `Unsupported language: ${language}` },
          { status: 400 }
        );
      }

      // CHANGED: Run each test case individually (Piston has no batch endpoint)
      // Judge0 used submitBatch + pollBatchResults; Piston is synchronous
      for (let i = 0; i < testCases.length; i++) {
        const { input, output } = testCases[i];

        let pistonResult;
        try {
          pistonResult = await executePiston(
            pistonLang.language,
            pistonLang.version,
            solutionCode,
            input
          );
        } catch (execError) {
          return NextResponse.json(
            { error: `Execution failed for ${language}: ${execError.message}` },
            { status: 500 }
          );
        }

        const { stdout, stderr, code } = pistonResult.run;

        // CHANGED: Verdict logic
        // Judge0: result.status.id === 3 meant "Accepted"
        // Piston: exit code 0 + stdout matches expected output = pass
        const actualOutput = (stdout ?? "").trim();
        const expectedOutput = (output ?? "").trim();
        const passed = code === 0 && actualOutput === expectedOutput;

        console.log(`Test case ${i + 1} details:`, {
          input,
          expectedOutput,
          actualOutput,
          exitCode: code,        // CHANGED: was result.status
          stderr,                // CHANGED: was result.stderr || result.compile_output
          language,
          passed,
        });

        // CHANGED: was result.status.id !== 3
        if (!passed) {
          return NextResponse.json(
            {
              error: `Validation failed for ${language}`,
              testCase: {
                input,
                expectedOutput,
                actualOutput,
                error: stderr || null,
                exitCode: code,
              },
            },
            { status: 400 }
          );
        }
      }
    }

    // Step 3: Save problem to DB (UNCHANGED)
    const newProblem = await db.problem.create({
      data: {
        title,
        description,
        difficulty,
        tags,
        examples,
        constraints,
        testCases,
        codeSnippets,
        referenceSolutions,
        userId: user.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Problem created successfully",
        data: newProblem,
      },
      { status: 201 }
    );
  } catch (dbError) {
    console.error("Database error:", dbError);
    return NextResponse.json(
      { error: "Failed to save problem to database" },
      { status: 500 }
    );
  }
}