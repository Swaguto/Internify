export type WorkType = "Remote" | "On-Site" | "Hybrid";

export type Sponsorship = "Yes" | "No" | "Unknown";

export type Category = "SWE" | "AI/ML" | "Quant" | "Systems/Infrastructure" | "Robotics";

export type ApplicationStatus = "Saved" | "Applied" | "Interviewing";

export type StatusMap = Partial<Record<string, ApplicationStatus>>;

export type SortKey = "newest" | "oldest" | "compensation" | "companyAZ";

export interface Job {
  id: string;
  companyName: string;
  companyLogoUrl?: string;
  companyLogoFallbackUrl?: string;
  roleTitle: string;
  season: string;
  location: string;
  workType: WorkType;
  compensation?: string;
  sponsorship: Sponsorship;
  datePosted: string;
  applicationUrl: string;
  category: Category;
}