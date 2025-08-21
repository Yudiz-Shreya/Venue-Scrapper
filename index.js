const fs = require('fs').promises;
const path = require('path');
const { scrapeCricbuzzVenue } = require('./scrapers/cricbuzz');
const { scrapeESPNVenue } = require('./scrapers/espn');
const { scrapeCricketDotComVenue } = require('./scrapers/cricketDotCom');
const { combineVenueData } = require('./utils/combineVenueData');

function getCleanStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const cleanStats = {};

  for (const category in stats) {
    const categoryData = stats[category];
    if (Object.values(categoryData).some(match => Object.keys(match).length > 0)) {
      cleanStats[category] = categoryData;
    }
  }

  return Object.keys(cleanStats).length > 0 ? cleanStats : null;
}

const VENUES_FILE_PATH = path.join(__dirname, 'new3.json');

async function scrapeVenue(oThirdparty) {
  const { cricbuzzUrl, espnUrl, cricketDotComUrl } = oThirdparty;
  let cricbuzzData = {};
  let espnData = {};
  let cricketDotComData = {};

  if (cricbuzzUrl) {
    try {
      cricbuzzData = await scrapeCricbuzzVenue(cricbuzzUrl);
    } catch (error) {
      console.error(`Error scraping Cricbuzz for ${cricbuzzUrl}: ${error.message}`);
    }
  }

  if (espnUrl) {
    try {
      espnData = await scrapeESPNVenue(espnUrl);
    } catch (error) {
      console.error(`Error scraping ESPN for ${espnUrl}: ${error.message}`);
    }
  }

  if (cricketDotComUrl) {
    try {
      cricketDotComData = await scrapeCricketDotComVenue(cricketDotComUrl);
    } catch (error) {
      console.error(`Error scraping Cricket.com for ${cricketDotComUrl}: ${error.message}`);
    }
  }

  return combineVenueData({
    cricbuzz: cricbuzzData,
    espn: espnData,
    cricketDotCom: cricketDotComData
  });
}

async function scrapeAllVenues() {
  try {
    console.log(`Reading venues from: ${VENUES_FILE_PATH}`);
    const venuesData = await fs.readFile(VENUES_FILE_PATH, 'utf8');
    const venues = JSON.parse(venuesData);
    const updatedVenues = [];

    console.log(`Found ${venues.length} venues to process.`);

    for (const [index, venue] of venues.entries()) {
      console.log(`Processing Venue ${index + 1}/${venues.length}: ${venue.sName}`);
      if (venue.oThirdparty && Object.keys(venue.oThirdparty).length > 0) {
        const scrapedData = await scrapeVenue(venue.oThirdparty);

        // 1. Define keys to keep from the original object.
        const baseKeysToKeep = [
          '_id', 'sVenueKey', 'sName', 'sLocation', 'sTimezone', 'eTagStatus',
          'bTagEnabled', 'dCreated', 'dUpdated', '__v', 'sLatitude', 'sLongitude', 'oThirdparty'
        ];

        // 2. Create a clean base object.
        const cleanVenue = {};
        baseKeysToKeep.forEach(key => {
          if (venue[key] !== undefined) {
            cleanVenue[key] = venue[key];
          }
        });

        if (scrapedData && Object.keys(scrapedData).length > 0) {
          const { stats, ...restOfScrapedData } = scrapedData;

          // 3. Merge the clean base and new scraped data.
          const finalVenue = { ...cleanVenue, ...restOfScrapedData };
          // Add oScraped object with timestamp
          finalVenue.oScraped = {
            bResult: true,
            timestamp: new Date().toISOString()
          };

          // 4. Get the cleaned stats object and add it if it's not null.
          const cleanedStats = getCleanStats(stats);
          if (cleanedStats) {
            finalVenue.stats = cleanedStats;
          }
          updatedVenues.push(finalVenue);
        } else {
          console.log(`No new data scraped for ${venue.sName}, using cleaned original data.`);
          // If scraping fails, still push the cleaned version of the venue.
          cleanVenue.scraped = venue.scraped; // Preserve original scraped status
          const originalCleanStats = getCleanStats(venue.stats);
          if (originalCleanStats) {
            cleanVenue.stats = originalCleanStats; // Preserve original stats if they are not empty
          }
          updatedVenues.push(cleanVenue);
        }
      } else {
        console.log(`Skipping venue ${venue.sName} as it has no 'oThirdparty' field.`);
        updatedVenues.push(venue);
      }
    }

    await fs.writeFile(VENUES_FILE_PATH, JSON.stringify(updatedVenues, null, 2));
    console.log(`\n--- Successfully updated ${VENUES_FILE_PATH} ---`);

  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

scrapeAllVenues();
