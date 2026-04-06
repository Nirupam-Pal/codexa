"use server";

import { db } from "@/lib/db";
import { getPistonLanguage, executePiston } from "@/lib/piston"; // CHANGED: replaces judge0 imports
import { currentUser } from "@clerk/nextjs/server";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

// UNCHANGED
export const getAllProblems = async () => {
  try {
    const user = await currentUser();
    const data = await db.user.findUnique({
      where: { clerkId: user?.id },
      select: { id: true },
    });

    const problems = await db.problem.findMany({
      include: {
        solvedBy: {
          where: { userId: data.id },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: problems };
  } catch (error) {
    console.error("❌ Error fetching problems:", error);
    return { success: false, error: "Failed to fetch problems" };
  }
};

// UNCHANGED
export const getProblemById = async (id) => {
  try {
    const problem = await db.problem.findUnique({
      where: { id },
    });
    return { success: true, data: problem };
  } catch (error) {
    console.error("❌ Error fetching problem:", error);
    return { success: false, error: "Failed to fetch problem" };
  }
};

// UNCHANGED
export const deleteProblem = async (problemId) => {
  try {
    const user = await currentUser();
    if (!user) throw new Error("Unauthorized");

    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { role: true },
    });

    if (dbUser?.role !== UserRole.ADMIN) {
      throw new Error("Only admins can delete problems");
    }

    await db.problem.delete({ where: { id: problemId } });

    revalidatePath("/problems");
    return { success: true, message: "Problem deleted successfully" };
  } catch (error) {
    console.error("Error deleting problem:", error);
    return { success: false, error: error.message || "Failed to delete problem" };
  }
};

// CHANGED: Migrated from Judge0 to Piston
export const executeCode = async (source_code, language, stdin, expected_outputs, id) => {
  // CHANGED: parameter was language_id (numeric), now language (string like "PYTHON")
  try {
    const user = await currentUser();
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
    });

    if (!dbUser) {
      return { success: false, error: "User not found" };
    }

    // Validation (UNCHANGED)
    if (
      !Array.isArray(stdin) ||
      stdin.length === 0 ||
      !Array.isArray(expected_outputs) ||
      expected_outputs.length !== stdin.length
    ) {
      return { success: false, error: "Invalid test cases" };
    }

    // CHANGED: Get Piston language config instead of Judge0 language ID
    const pistonLang = getPistonLanguage(language);
    if (!pistonLang) {
      return { success: false, error: `Unsupported language: ${language}` };
    }

    // CHANGED: Run each test case individually through Piston
    // Judge0 used submitBatch (all at once) + pollBatchResults (polling)
    // Piston is synchronous — no batching, no polling needed
    let allPassed = true;
    const detailedResults = [];

    for (let i = 0; i < stdin.length; i++) {
      let pistonResult;
      try {
        pistonResult = await executePiston(
          pistonLang.language,
          pistonLang.version,
          source_code,
          stdin[i]
        );
      } catch (execError) {
        return { success: false, error: `Execution failed: ${execError.message}` };
      }

      // CHANGED: Piston returns { run: { stdout, stderr, code, signal } }
      // Judge0 returned { stdout, stderr, status: { id, description }, memory, time }
      const { stdout, stderr, code } = pistonResult.run;

      const actualOutput = (stdout ?? "").trim();
      const expectedOutput = (expected_outputs[i] ?? "").trim();
      const passed = code === 0 && actualOutput === expectedOutput;

      if (!passed) allPassed = false;

      detailedResults.push({
        testCase: i + 1,
        passed,
        stdout: actualOutput || null,
        expected: expectedOutput,
        stderr: stderr || null,
        compile_output: null,   // CHANGED: Piston doesn't separate compile output
        // CHANGED: derive status from exit code instead of result.status.description
        status: passed ? "Accepted" : code !== 0 ? "Runtime Error" : "Wrong Answer",
        memory: null,           // CHANGED: Piston doesn't return memory usage
        time: null,             // CHANGED: Piston doesn't return execution time
      });
    }

    // Save submission to DB (structure UNCHANGED, values updated)
    const submission = await db.submission.create({
      data: {
        userId: dbUser.id,
        problemId: id,
        sourceCode: source_code,
        language,                // CHANGED: storing language string directly (was getLanguageName(language_id))
        stdin: stdin.join("\n"),
        stdout: JSON.stringify(detailedResults.map((r) => r.stdout)),
        stderr: detailedResults.some((r) => r.stderr)
          ? JSON.stringify(detailedResults.map((r) => r.stderr))
          : null,
        compileOutput: null,     // CHANGED: Piston doesn't provide compile output
        status: allPassed ? "Accepted" : "Wrong Answer",
        memory: null,            // CHANGED: Piston doesn't provide memory
        time: null,              // CHANGED: Piston doesn't provide time
      },
    });

    // Mark problem as solved if all passed (UNCHANGED)
    if (allPassed) {
      await db.problemSolved.upsert({
        where: {
          userId_problemId: { userId: dbUser.id, problemId: id },
        },
        update: {},
        create: { userId: dbUser.id, problemId: id },
      });
    }

    // Save individual test case results (UNCHANGED)
    const testCaseResults = detailedResults.map((result) => ({
      submissionId: submission.id,
      testCase: result.testCase,
      passed: result.passed,
      stdout: result.stdout,
      expected: result.expected,
      stderr: result.stderr,
      compileOutput: result.compile_output,
      status: result.status,
      memory: result.memory,
      time: result.time,
    }));

    await db.testCaseResult.createMany({ data: testCaseResults });

    const submissionWithTestCases = await db.submission.findUnique({
      where: { id: submission.id },
      include: { testCases: true },
    });

    return { success: true, submission: submissionWithTestCases };

  } catch (error) {
    console.error("Execution error:", error);
    return { success: false, error: "Failed to execute code" };
  }
};

// UNCHANGED
export const getAllSubmissionByCurrentUserForProblem = async (problemId) => {
  const user = await currentUser();
  const dbUser = await db.user.findUnique({
    where: { clerkId: user.id },
  });

  const submissions = await db.submission.findMany({
    where: { problemId, userId: dbUser.id },
  });

  return { success: true, data: submissions };
};