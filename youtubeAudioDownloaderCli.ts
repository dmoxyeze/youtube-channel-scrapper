import fs from "fs";
import { processAllVideos } from "./youtubeAudioDownloader";
import { ScrapedContent } from "./types";

const [, , jsonFilePath] = process.argv;

if (!jsonFilePath || !jsonFilePath.includes("youtube.com")) {
  console.error(
    "Usage: ts-node youtubeAudioDownloaderCli.ts <path-to-your-youtube_content_*.json>"
  );
  process.exit(1);
}
// Read the JSON file
const jsonData = fs.readFileSync(jsonFilePath, "utf8");
const videos: ScrapedContent[] = JSON.parse(jsonData);
(async () => {
  try {
    await processAllVideos(videos);
  } catch (error) {
    console.log(error);
  }
})();
