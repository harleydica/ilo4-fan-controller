#!/usr/bin/env tsx
/**
 * Auto Fan Curve Daemon
 * Runs CPU-based fan curve every N seconds
 * 
 * Usage: npx tsx auto-fan-daemon.ts [interval-seconds]
 * Example: npx tsx auto-fan-daemon.ts 10
 */

import "dotenv/config";
import { NodeSSH } from "node-ssh";
import { applyCpuFanCurve, createIloSsh, disposeIloSsh } from "./src/lib/iloClient";

const INTERVAL_SECONDS = parseInt(process.argv[2] || "10", 10);

if (INTERVAL_SECONDS < 5) {
    console.error("⚠️  Interval minimum adalah 5 detik untuk menghindari overload iLO");
    process.exit(1);
}

console.log(`🌀 Auto Fan Daemon started - checking every ${INTERVAL_SECONDS} seconds`);
console.log(`📊 Press Ctrl+C to stop\n`);

let previousFanPercents: number[] = [];
let iterationCount = 0;
let sshSession: NodeSSH | null = null;

const getSession = async (): Promise<NodeSSH> => {
    if (sshSession) return sshSession;
    sshSession = await createIloSsh();
    return sshSession;
};

const runCheck = async () => {
    if (iterationCount >= 1000) {
        console.clear();
        iterationCount = 0;
        console.log("🧹 Logs cleared after 1000 checks, counter reset\n");
    }

    iterationCount++;
    const timestamp = new Date().toLocaleString("id-ID");
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔄 Check #${iterationCount} - ${timestamp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
        const session = await getSession();
        const result = await applyCpuFanCurve(session);
        
        // Detect changes
        const hasChanges = previousFanPercents.length === 0 || 
            !previousFanPercents.every((prev, idx) => prev === result.fanPercents[idx]);

        if (hasChanges && previousFanPercents.length > 0) {
            console.log("\n⚡ PERUBAHAN SPEED TERDETEKSI:");
            result.fanPercents.forEach((curr, idx) => {
                const prev = previousFanPercents[idx] ?? 0;
                if (prev !== curr) {
                    const change = curr > prev ? "↑" : "↓";
                    console.log(`   ${change} Fan ${idx + 1}: ${prev}% → ${curr}%`);
                }
            });
        } else if (hasChanges) {
            console.log("✓ Initial fan speeds applied");
        } else {
            console.log("✓ No changes - fan speeds maintained");
        }

        previousFanPercents = result.fanPercents;

    } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : String(error));
        disposeIloSsh(sshSession);
        sshSession = null;
    }
};

// Run immediately, then at intervals
runCheck();
setInterval(runCheck, INTERVAL_SECONDS * 1000);

// Graceful shutdown
process.on("SIGINT", () => {
    disposeIloSsh(sshSession);
    console.log("\n\n👋 Daemon stopped");
    process.exit(0);
});
