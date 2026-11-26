export function trackerMilestone(count: number) {
  if (count >= 30) return "communityLeader" as const;
  if (count >= 20) return "providingForFamily" as const;
  if (count >= 10) return "gettingStarted" as const;
  return "seedPlanted" as const;
}
