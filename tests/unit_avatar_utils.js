
import { getDeterministicColor, getClientInitials } from '../src/utils/avatarUtils.js';
import assert from 'node:assert';

console.log("Testing avatarUtils...");

// Test initials
assert.strictEqual(getClientInitials("Brain Studio"), "BS");
assert.strictEqual(getClientInitials("TruPeak"), "TR");
assert.strictEqual(getClientInitials("  Artyzza  "), "AR");
console.log("✅ getClientInitials passed");

// Test deterministic color
const color1 = getDeterministicColor("client-123");
const color2 = getDeterministicColor("client-123");
assert.strictEqual(color1, color2, "Color should be deterministic for same ID");

// Verify stable color for specific inputs (based on 10-color palette)
console.log(`Color for 'client-123': ${color1}`);

console.log("✅ getDeterministicColor passed");
