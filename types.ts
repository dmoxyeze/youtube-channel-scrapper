export interface ScrapedContent {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  views?: string;
  uploadDate?: string;
  type: "video" | "livestream" | "upcoming";
  isLive?: boolean;
  scheduledStartTime?: string;
  concurrentViewers?: string;
}
