// scrapers/espn.js - Combined ESPN scraper for venue info and match details
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scrape venue information from ESPN Cricinfo
 */
async function scrapeESPNVenue(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    });

    const $ = cheerio.load(data);
    const venueData = {};

    // Final, most robust helper function
    const getInfo = (label) => {
      let value = '';
      $('tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length > 1 && $(cells[0]).text().includes(label)) {
          value = $(cells[1]).text().trim();
          return false; // exit loop
        }
      });
      return value;
    };

    // 1. Extract Venue Name
    const pageTitle = $('title').text();
    if (pageTitle) {
      let name = pageTitle.split('|')[0].split(',')[0].trim();
      if (name.toLowerCase() !== 'overview') {
        venueData.venueName = name;
      }
    }

    // 2. Extract and parse all fields
    // Also Known As (convert to array)
    const alsoKnownAs = getInfo('Also knows as');
    venueData.alsoKnownAs = alsoKnownAs
      ? alsoKnownAs.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    venueData.opened = getInfo('Established');
    venueData.capacity = getInfo('Capacity');
    venueData.dimensions = getInfo('Playing area');
    venueData.ends = getInfo('End Names').split(',').map(s => s.trim());
    venueData.floodLights = getInfo('Flood Light'); // Partial match is enough
    venueData.homeTeams = getInfo('Home Teams').split(',').map(s => s.trim());

    // Parse otherSports into an array
    const otherSportsText = getInfo('Other Sports');
    if (otherSportsText) {
      venueData.otherSports = otherSportsText
        .replace(/ as well as /g, ',')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      venueData.otherSports = [];
    }

    venueData.pitch = getInfo('Pitch');
    venueData.curator = getInfo('Curator');

    return venueData;
  } catch (error) {
    console.error(`Error scraping ESPN venue ${url}:`, error.message);
    return {};
  }
}

/**
 * Scrape match details from ESPN Cricinfo match page
 */
async function scrapeESPNMatchDetails(matchUrl) {
  try {
    const { data } = await axios.get(matchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data);

    const matchDetails = {
      matchTitle: $('.match-header h1, .header-title h1').text().trim(),
      date: $('.match-info .date, .match-detail-item .date').text().trim(),
      venue: $('.match-info .venue, .match-detail-item .venue').text().trim(),
      tossInfo: $('.toss-info, .match-detail-toss').text().trim(),
      result: $('.result, .match-result').text().trim(),
      scorecard: {},
      playerOfMatch: $('.player-of-match, .award-winner').text().trim()
    };

    // Extract basic scorecard details
    $('.scorecard-section, .innings').each((_, section) => {
      const teamName = $(section).find('.team-name, .team').text().trim();
      const score = $(section).find('.score, .total').text().trim();
      const overs = $(section).find('.overs, .over-detail').text().trim();

      if (teamName && score) {
        matchDetails.scorecard[teamName] = {
          score: score,
          overs: overs
        };
      }
    });

    return matchDetails;
  } catch (error) {
    return null;
  }
}

/**
 * Search for ESPN match URL based on teams and score
 */
async function findESPNMatchUrl(teams, score, format = 't20') {
  try {
    // Create search query for ESPN Cricinfo
    const searchQuery = `${teams} ${score} ${format} site:espncricinfo.com scorecard`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    const { data } = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(data);

    // Find ESPN Cricinfo match URL from search results
    let matchUrl = null;
    $('a[href*="espncricinfo.com"]').each((_, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('scorecard') && !matchUrl) {
        // Clean up Google redirect URL
        const cleanUrl = href.replace(/\/url\?q=/, '').split('&')[0];
        matchUrl = decodeURIComponent(cleanUrl);
      }
    });

    return matchUrl;
  } catch (error) {
    return null;
  }
}

module.exports = {
  scrapeESPNVenue,
  scrapeESPNMatchDetails,
  findESPNMatchUrl
};
