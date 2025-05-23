import fs from "fs";
import { exec } from "child_process";
import path from "path";
import { ScrapedContent } from "./types";

// Output directory
const outputDir = "./downloaded_audio";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Download function
function downloadAudio(url: string, title: string, uploadDate: string) {
  return new Promise((resolve, reject) => {
    const titleSantized = sanitizeFilename(title);
    const uploadDateSantized = sanitizeFilename(uploadDate);
    // Sanitize filename
    const safeTitle = `${titleSantized}_${uploadDateSantized}`;
    const outputPath = path.join(outputDir, `${safeTitle}.mp3`);

    const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" ${url}`;

    console.log(`Downloading: ${title}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error downloading ${title}:`, error.message);
        return reject(error);
      }
      console.log(`Finished: ${title}`);
      resolve(outputPath);
    });
  });
}

// Process all videos
export async function processAllVideos(videos: ScrapedContent[]) {
  for (const video of videos) {
    try {
      await downloadAudio(
        video.url,
        video.title,
        video.uploadDate || new Date().getTime().toString()
      );
      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to download ${video.title}:`, error);
    }
  }
  console.log("All downloads completed!");
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // Remove invalid characters for filenames
    .replace(/\s+/g, "_") // Replace multiple spaces with a single space
    .trim(); // Trim leading and trailing spaces
}

// processAllVideos();
