import { scrapeYouTubeChannel, exportToJsonFile } from "./youtubeScraperMain";

const [, , channelUrl] = process.argv;

if (!channelUrl || !channelUrl.includes("youtube.com")) {
  console.error(
    "Usage: ts-node youtubeChannelScrapperCli.ts <YouTubeChannelURL>"
  );
  process.exit(1);
}

(async () => {
  console.log(`Scraping channel: ${channelUrl}`);
  try {
    const videos = await scrapeYouTubeChannel(
      channelUrl,
      10000,
      false, // Show browser
      true, // Include livestreams
      true // Include videos
    );
    console.log(`Fetched ${videos.length} videos`);
    exportToJsonFile(videos);
  } catch (error) {
    console.log(error);
  }
})();
