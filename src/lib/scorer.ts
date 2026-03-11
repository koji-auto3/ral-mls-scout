const PRIMARY_KEYWORDS = [
  "assisted living",
  "board and care",
  "group home",
  "memory care",
  "adult family home",
  "AHCA licensed",
  "state licensed care",
  "care facility",
  "skilled nursing",
  "nurse call system",
  "residential care facility",
  "licensed care",
];

const SECONDARY_KEYWORDS = [
  "fire suppression",
  "commercial sprinkler",
  "sprinkler system",
  "ADA compliant",
  "ADA bathroom",
  "handicap accessible",
  "ADA accessible",
  "wide doorways",
  "36-inch doors",
  "wider doors",
  "wide hallways",
  "grab bars",
  "roll-in shower",
  "zero threshold",
  "wheelchair accessible",
  "wheelchair ramp",
  "no-step entry",
  "commercial kitchen",
  "licensed kitchen",
  "caretaker suite",
  "in-law suite",
  "multigenerational",
];

export function scoreDescription(
  description: string
): {
  score: "HIGH" | "MEDIUM" | "LOW" | null;
  matchedKeywords: string[];
} {
  const lowerDesc = description.toLowerCase();
  const matchedKeywords: string[] = [];

  // Check primary keywords
  for (const keyword of PRIMARY_KEYWORDS) {
    if (lowerDesc.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  // If any primary keyword found, score is HIGH
  if (matchedKeywords.length > 0) {
    return { score: "HIGH", matchedKeywords };
  }

  // Check secondary keywords
  let secondaryCount = 0;
  for (const keyword of SECONDARY_KEYWORDS) {
    if (lowerDesc.includes(keyword)) {
      matchedKeywords.push(keyword);
      secondaryCount++;
    }
  }

  // Score based on secondary keyword count
  if (secondaryCount >= 3) {
    return { score: "MEDIUM", matchedKeywords };
  }

  if (secondaryCount >= 1) {
    return { score: "LOW", matchedKeywords };
  }

  // No matches
  return { score: null, matchedKeywords: [] };
}
