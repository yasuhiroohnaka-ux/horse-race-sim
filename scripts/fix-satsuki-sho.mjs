import fs from 'fs';
import path from 'path';

// Define the absolute path based on the repository structure
const weeklyRacesPath = path.join(process.cwd(), 'data', 'weekly-races.json');

// Read and parse the current JSON data
const rawData = fs.readFileSync(weeklyRacesPath, 'utf8');
const root = JSON.parse(rawData);

if (!root || !root.currentWeek || !root.currentWeek.races) {
  console.error("Invalid JSON structure: Couldn't find root.currentWeek.races");
  process.exit(1);
}

const races = root.currentWeek.races;

// 1 & 2: Identify Satsuki Sho Race unique index
const satsukiShoIndex = races.findIndex(r => r.label === '皐月賞' && r.courseId.includes('nakayama') && r.distance === 2000);

if (satsukiShoIndex === -1) {
  console.error('Could not find 皐月賞 target in weekly-races.json');
  process.exit(1);
}

const satsukiSho = races[satsukiShoIndex];

// Correct 18 entries and their confirmed gate numbers
const correctEntries = [
  { gateNumber: 1, name: 'カヴァレリッツォ' },
  { gateNumber: 2, name: 'サウンドムーブ' },
  { gateNumber: 3, name: 'サノノグレーター' },
  { gateNumber: 4, name: 'ロブチェン' },
  { gateNumber: 5, name: 'アスクエジンバラ' },
  { gateNumber: 6, name: 'フォルテアンジェロ' },
  { gateNumber: 7, name: 'ロードフィレール' },
  { gateNumber: 8, name: 'マテンロウゲイル' },
  { gateNumber: 9, name: 'ライヒスアドラー' },
  { gateNumber: 10, name: 'ラージアンサンブル' },
  { gateNumber: 11, name: 'パントルナイーフ' },
  { gateNumber: 12, name: 'グリーンエナジー' },
  { gateNumber: 13, name: 'アクロフェイズ' },
  { gateNumber: 14, name: 'ゾロアストロ' },
  { gateNumber: 15, name: 'リアライズシリウス' },
  { gateNumber: 16, name: 'アルトラムス' },
  { gateNumber: 17, name: 'アドマイヤクワッズ' },
  { gateNumber: 18, name: 'バステール' }
];

const excludedHorses = ["アスクイキゴミ", "オルフセン", "サイモンシャリオ"];

// Print before state
console.log(`[Before] Total runners: ${satsukiSho.horses.length}`);

const updatedHorses = [];
const missingHorses = [];

for (const entry of correctEntries) {
  // Find the horse object in the existing array using the name
  // To avoid modifying other fields, we just update what's needed for the gate assignment
  const existingHorse = satsukiSho.horses.find(h => h.name === entry.name);
  if (existingHorse) {
    // 5. Update the gateNumber (number) and id (string)
    existingHorse.gateNumber = entry.gateNumber;
    existingHorse.id = String(entry.gateNumber);
    // Add to our new array
    updatedHorses.push(existingHorse);
  } else {
    missingHorses.push(entry.name);
  }
}

// Check for missing items that should be present
if (missingHorses.length > 0) {
  console.error("Missing expected horses from the data source:", missingHorses);
  process.exit(1);
}

// 4. Sort the result 1 to 18 to be completely deterministic (already in order because of correctEntries structure but let's be explicit)
updatedHorses.sort((a, b) => a.gateNumber - b.gateNumber);

// Verify excluded horses were successfully dropped
for (const excluded of excludedHorses) {
  if (updatedHorses.some(h => h.name === excluded)) {
    console.error(`Excluded horse unexpectedly included! ${excluded}`);
    process.exit(1);
  }
}

// 3. Update the horses array for Satsuki Sho
satsukiSho.horses = updatedHorses;

// Serialize safely and rewrite
fs.writeFileSync(weeklyRacesPath, JSON.stringify(root, null, 2) + "\n", 'utf8');

// 7. Verify we have 18 horses exactly
console.log(`[After] Total runners in array: ${satsukiSho.horses.length}`);

// 8. Output id, gateNumber, and name for confirmation
console.log('Resulting Horses List:');
console.log('ID | Gate | Name');
console.log('---------------------------');
satsukiSho.horses.forEach(h => {
  console.log(`${h.id.padStart(2, ' ')} | ${String(h.gateNumber).padStart(4, ' ')} | ${h.name}`);
});

console.log('\nExclusions verified: アスクイキゴミ, オルフセン, サイモンシャリオ were dropped.');

// 9. Integration of Verify Logic
if (satsukiSho.horses.length !== 18) {
  console.error(`Verification Failed: Expected 18 horses, got ${satsukiSho.horses.length}`);
  process.exit(1);
}

const ids = new Set();
const gates = new Set();
for (const [index, horse] of satsukiSho.horses.entries()) {
  const expectedGate = index + 1;
  if (horse.gateNumber !== expectedGate) {
    console.error(`Verification Failed: Horse at index ${index} has gateNumber ${horse.gateNumber}, expected ${expectedGate}`);
    process.exit(1);
  }
  if (horse.id !== String(expectedGate)) {
    console.error(`Verification Failed: Horse at index ${index} has id ${horse.id}, expected ${expectedGate}`);
    process.exit(1);
  }
  ids.add(horse.id);
  gates.add(horse.gateNumber);
}

if (ids.size !== 18 || gates.size !== 18) {
  console.error("Verification Failed: Duplicates found in IDs or Gates.");
  process.exit(1);
}

console.log('Successfully updated weekly-races.json with reproducible fixes and passed all internal verifications.');
