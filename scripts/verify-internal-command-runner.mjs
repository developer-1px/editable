import { spawn } from "node:child_process";

export function runCommand(command, args, iteration) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`[verify-internal] ${label}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix = signal === null ? `exit code ${code}` : `signal ${signal}`;
      reject(
        new Error(
          `[verify-internal] failed on iteration ${iteration}: ${label} (${suffix})`,
        ),
      );
    });
  });
}
