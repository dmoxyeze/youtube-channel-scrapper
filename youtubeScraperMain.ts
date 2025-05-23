import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { ScrapedContent } from "./types";

puppeteer.use(StealthPlugin());

// Utility functions
function delay(min: number, max: number): Promise<void> {
  return new Promise((res) =>
    setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min)
  );
}

function cleanUrl(url: string): string {
  if (!url) return "";
  return url.split("&")[0].replace("shorts/", "watch?v=").split("?si=")[0];
}

export async function scrapeYouTubeChannel(
  channelUrl: string,
  maxItems: number = 100,
  headless: boolean = true,
  includeLivestreams: boolean = true,
  includeVideos: boolean = true
): Promise<ScrapedContent[]> {
  const browser = await puppeteer.launch({
    headless,
    slowMo: headless ? 0 : 80,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Rotating user agents
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];
  await page.setUserAgent(agents[Math.floor(Math.random() * agents.length)]);

  // Block unnecessary resources but allow CSS and XHR
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const block = ["image", "font", "media", "other"];
    if (block.includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Prepare URLs for both videos and streams
  const baseUrl = channelUrl.replace(/\/$/, "");
  const urlsToScrape = [];

  if (includeVideos) urlsToScrape.push(`${baseUrl}/videos`);
  if (includeLivestreams) urlsToScrape.push(`${baseUrl}/streams`);

  const allContent: ScrapedContent[] = [];

  for (const targetUrl of urlsToScrape) {
    console.log(`Navigating to ${targetUrl}`);
    try {
      await page.goto(targetUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
    } catch (error) {
      console.error(`Navigation to ${targetUrl} failed:`, error);
      continue;
    }

    // Handle cookie consent (only needed once)
    if (targetUrl === urlsToScrape[0]) {
      try {
        const cookieButton = await page.waitForSelector(
          'button[aria-label="Accept all"], button:has-text("Accept all")',
          { timeout: 5000 }
        );
        if (cookieButton) {
          await cookieButton.click();
          console.log("Dismissed cookie popup");
          await delay(1000, 2000);
        }
      } catch {
        console.log("No cookie popup found");
      }
    }

    // Wait for initial content to load
    try {
      await page.waitForSelector(
        "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-grid-stream-renderer",
        { timeout: 10000 }
      );
    } catch (error) {
      console.error(`Initial content not found at ${targetUrl}:`, error);
      continue;
    }

    // Improved infinite scroll handling
    let scrollAttempts = 0;
    const maxScrollAttempts = 5;
    let lastHeight = 0;
    let currentHeight = 0;
    let itemCount = 0;

    while (scrollAttempts < maxScrollAttempts && allContent.length < maxItems) {
      lastHeight = await page.evaluate(() => document.body.scrollHeight);

      // Scroll in smaller increments for better loading
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        await delay(1500, 2500);
      }

      // Wait for content to load
      await delay(3000, 4000);

      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const newItemCount = await page.evaluate(() => {
        return document.querySelectorAll(
          "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-grid-stream-renderer"
        ).length;
      });

      if (currentHeight === lastHeight && newItemCount === itemCount) {
        scrollAttempts++;
        console.log(
          `No new content (attempt ${scrollAttempts}/${maxScrollAttempts})`
        );
      } else {
        scrollAttempts = 0;
        itemCount = newItemCount;
        console.log(`Found ${itemCount} items...`);
      }

      if (maxItems && allContent.length >= maxItems) break;
    }

    // Extract content data
    const pageContent: ScrapedContent[] = await page.evaluate((targetUrl) => {
      const isStreamsPage = targetUrl.includes("/streams");
      const elements = Array.from(
        document.querySelectorAll(
          "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-grid-stream-renderer"
        )
      );

      return elements
        .map((el) => {
          try {
            const anchor = el.querySelector(
              "a#video-title-link, a#video-title"
            ) as HTMLAnchorElement;
            if (!anchor) return null;

            // Common properties
            const result: ScrapedContent = {
              url: anchor.href || "",
              title: anchor.title || anchor.textContent?.trim() || "",
              type: "video",
              isLive: false,
            };

            // Thumbnail
            const thumbnailEl = el.querySelector("yt-image img, img#img");
            result.thumbnail = (
              thumbnailEl?.getAttribute("src") ||
              thumbnailEl?.getAttribute("data-src") ||
              ""
            ).replace("hqdefault", "maxresdefault");

            // Determine content type
            if (isStreamsPage) {
              result.type = el.querySelector(
                ".ytd-thumbnail-overlay-time-status-renderer[aria-label='LIVE NOW']"
              )
                ? "livestream"
                : "upcoming";
              result.isLive = result.type === "livestream";

              // Viewers count for live streams
              if (result.isLive) {
                const viewersEl = el.querySelector(
                  ".ytd-grid-stream-renderer .ytd-video-meta-block span"
                );
                result.concurrentViewers = viewersEl?.textContent?.trim();
              } else {
                const durationEl =
                  el.querySelector("span#text") ||
                  el.querySelector(
                    ".ytd-thumbnail-overlay-time-status-renderer"
                  );
                const duration = durationEl?.textContent?.trim() || "";
                const viewsEl =
                  el.querySelector("ytd-video-meta-block span") ||
                  el.querySelector("#metadata-line span:nth-child(1)");
                const views = viewsEl?.textContent?.trim() || "";

                const timeEl =
                  el.querySelector("#metadata-line span:nth-child(2)") ||
                  el.querySelector("div#metadata-line > span:nth-of-type(2)") ||
                  el.querySelector("ytd-video-meta-block span:nth-child(2)");
                const time = timeEl?.textContent?.trim() || "";
                result.duration = duration;
                result.uploadDate = time;
                result.views = views;
              }

              // Scheduled time for upcoming streams
              if (result.type === "upcoming") {
                const timeEl = el.querySelector(
                  ".ytd-grid-stream-renderer .ytd-video-meta-block span"
                );
                result.scheduledStartTime = timeEl?.textContent?.trim();
              }
            } else {
              // Regular video properties
              const durationEl =
                el.querySelector("span#text") ||
                el.querySelector(".ytd-thumbnail-overlay-time-status-renderer");
              const duration = durationEl?.textContent?.trim() || "";
              const viewsEl =
                el.querySelector("ytd-video-meta-block span") ||
                el.querySelector("#metadata-line span:nth-child(1)");
              const views = viewsEl?.textContent?.trim() || "";

              const timeEl =
                el.querySelector("#metadata-line span:nth-child(2)") ||
                el.querySelector("div#metadata-line > span:nth-of-type(2)") ||
                el.querySelector("ytd-video-meta-block span:nth-child(2)");
              const time = timeEl?.textContent?.trim() || "";
              result.duration = duration;
              result.uploadDate = time;
              result.views = views;
            }

            return result;
          } catch (error) {
            console.error("Error processing element:", error);
            return null;
          }
        })
        .filter(
          (v): v is ScrapedContent => v !== null && v.url.includes("watch?v=")
        );
    }, targetUrl);

    allContent.push(...pageContent);
  }

  await browser.close();

  // Clean and deduplicate results
  const cleanedData = allContent.map((v) => ({
    ...v,
    url: cleanUrl(v.url),
  }));

  const uniqueContent = Array.from(
    new Map(cleanedData.map((v) => [v.url, v])).values()
  );

  return uniqueContent.slice(0, maxItems);
}

export function exportToJsonFile(
  data: ScrapedContent[],
  filename: string = `youtube_content_${new Date().getTime()}.json`
) {
  const filepath = path.resolve(process.cwd(), filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`✅ Exported ${data.length} items to ${filepath}`);
}
